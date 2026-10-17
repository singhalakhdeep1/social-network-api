/**
 * Query cost controls (roadmap: depth limiting and complexity limits) and per-caller rate limiting.
 */
import { ASTVisitor, FieldNode, FragmentDefinitionNode, GraphQLError, GraphQLList, GraphQLNonNull, Kind, OperationDefinitionNode, SelectionSetNode, ValidationContext } from 'graphql';
import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { fieldExtensionsEstimator, getComplexity, ComplexityEstimator } from 'graphql-query-complexity';
import { schema } from './schema';
import { Context } from './context';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { rateLimiter } from '../services/rate-limiting/rate-limiting.service';
import { structuredLogger } from '../services/structured-logging/structured-logging.service';
import logger from '../utils/logger';

// ---------------------------------------------------------------- depth

/** Validation rule: rejects operations nested deeper than `maxDepth` (introspection exempt). */
export const depthLimitRule = (maxDepth: number) => (context: ValidationContext): ASTVisitor => {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of context.getDocument().definitions) if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);

  const depthOf = (selection: SelectionSetNode | undefined, current: number, seen: Set<string>): number => {
    if (!selection) return current;
    let max = current;
    for (const sel of selection.selections) {
      if (sel.kind === Kind.FIELD) {
        if (sel.name.value.startsWith('__')) continue;
        max = Math.max(max, depthOf(sel.selectionSet, current + 1, seen));
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        max = Math.max(max, depthOf(sel.selectionSet, current, seen));
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const name = sel.name.value;
        if (seen.has(name)) continue;
        const frag = fragments.get(name);
        if (frag) max = Math.max(max, depthOf(frag.selectionSet, current, new Set(seen).add(name)));
      }
    }
    return max;
  };

  return {
    OperationDefinition(node: OperationDefinitionNode) {
      const depth = depthOf(node.selectionSet, 0, new Set());
      if (depth > maxDepth) {
        context.reportError(new GraphQLError(`Query is too deep: depth ${depth} exceeds the limit of ${maxDepth}`, { nodes: [node], extensions: { code: 'QUERY_TOO_DEEP' } }));
      }
    }
  };
};

// ---------------------------------------------------------------- complexity

const PAGE_FIELDS = new Set(['nodes', 'items']);

/** List fields multiply their children's cost by the page size they were asked for. */
const listEstimator: ComplexityEstimator = ({ type, args, childComplexity, field }) => {
  // Meta fields (__typename, which Apollo Client adds to every selection set) cost nothing to resolve.
  if (field.name.startsWith('__')) return 0;
  const unwrapped = type instanceof GraphQLNonNull ? type.ofType : type;
  const isList = unwrapped instanceof GraphQLList;
  const limit = typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 100) : undefined;
  if (PAGE_FIELDS.has(field.name)) return 1 + childComplexity; // the page-size multiplier was applied on the parent
  if (limit !== undefined) return 1 + childComplexity * limit;
  if (isList) return 1 + childComplexity * 10;
  return 1 + childComplexity;
};

export const complexityPlugin = (): ApolloServerPlugin<Context> => ({
  async requestDidStart(): Promise<GraphQLRequestListener<Context>> {
    return {
      async didResolveOperation({ request, document, operationName }) {
        if (!operationName?.startsWith('IntrospectionQuery') && request.query) {
          const complexity = getComplexity({
            schema,
            query: document,
            variables: request.variables ?? {},
            operationName: request.operationName ?? undefined,
            estimators: [fieldExtensionsEstimator(), listEstimator]
          });
          if (complexity > env.maxQueryComplexity) {
            throw new AppError('BAD_USER_INPUT', `Query is too complex: ${complexity} exceeds the limit of ${env.maxQueryComplexity}`, { complexity, http: { status: 400 } });
          }
        }
      }
    };
  }
});

// ---------------------------------------------------------------- rate limiting

const AUTH_FIELDS = new Set(['login', 'register', 'forgotPassword', 'resetPassword', 'refreshToken']);

export const rateLimitPlugin = (): ApolloServerPlugin<Context> => ({
  async requestDidStart(): Promise<GraphQLRequestListener<Context>> {
    return {
      async didResolveOperation({ contextValue, operation, document }) {
        if (!operation) return;
        const rootFields = operation.selectionSet.selections.filter((s): s is FieldNode => s.kind === Kind.FIELD).map((s) => s.name.value);
        if (rootFields.every((f) => f.startsWith('__'))) return;
        void document;

        // Credential endpoints: tight per-IP bucket (default 10 burst, 1 per 6 s) to blunt brute force.
        if (rootFields.some((f) => AUTH_FIELDS.has(f))) {
          const res = await rateLimiter.consume(`auth:${contextValue.ip}`, 1, { capacity: env.authRateLimitCapacity, refillRate: env.authRateLimitPerMinute / 60 });
          if (!res.allowed) throw new AppError('RATE_LIMITED', `Too many attempts. Retry in ${res.retryAfterSeconds}s`, { retryAfterSeconds: res.retryAfterSeconds, http: { status: 429 } });
        }

        const cost = operation.operation === 'mutation' ? 5 : 1;
        const key = `gql:${contextValue.user?.id ?? contextValue.ip}`;
        const res = await rateLimiter.consume(key, cost);
        if (!res.allowed) throw new AppError('RATE_LIMITED', `Rate limit exceeded. Retry in ${res.retryAfterSeconds}s`, { retryAfterSeconds: res.retryAfterSeconds, http: { status: 429 } });
      }
    };
  }
});

// ---------------------------------------------------------------- request logging

export const loggingPlugin = (onOperation: (name: string, type: string, seconds: number, failed: boolean) => void): ApolloServerPlugin<Context> => ({
  async requestDidStart({ contextValue }): Promise<GraphQLRequestListener<Context>> {
    const started = process.hrtime.bigint();
    let opName = 'anonymous';
    let opType = 'query';
    // enterWith: every log line emitted while this request executes carries its correlation id
    structuredLogger.setContext({ correlationId: contextValue.correlationId, userId: contextValue.user?.id, ipAddress: contextValue.ip, userAgent: contextValue.userAgent });
    return {
      async didResolveOperation({ operationName, operation }) {
        if (!operation) return;
        opName = operationName ?? operation.selectionSet.selections.map((s) => (s.kind === Kind.FIELD ? s.name.value : '')).join(',');
        opType = operation.operation;
      },
      async didEncounterErrors({ errors }) {
        for (const e of errors) {
          const code = (e.extensions?.code as string | undefined) ?? 'INTERNAL_SERVER_ERROR';
          if (code === 'INTERNAL_SERVER_ERROR') logger.error(`GraphQL ${opType} ${opName}: ${e.message}`, { stack: e.originalError?.stack, correlationId: contextValue.correlationId });
          else logger.debug(`GraphQL ${opType} ${opName} rejected: ${code} ${e.message}`);
        }
      },
      async willSendResponse({ errors }) {
        const seconds = Number(process.hrtime.bigint() - started) / 1e9;
        onOperation(opName, opType, seconds, !!errors?.length);
      }
    };
  }
});
