/**
 * Domain errors. They extend GraphQLError so Apollo exposes the `code`, and the tRPC / gRPC
 * adapters map the same codes to their own status models.
 */
import { GraphQLError } from 'graphql';

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_USER_INPUT'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TWO_FACTOR_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'INTERNAL_SERVER_ERROR';

export class AppError extends GraphQLError {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
    super(message, { extensions: { code, ...extra } });
    this.code = code;
  }
}

export const unauthenticated = (message = 'You must be signed in'): AppError => new AppError('UNAUTHENTICATED', message);
export const forbidden = (message = 'You are not allowed to do that'): AppError => new AppError('FORBIDDEN', message);
export const notFound = (entity: string): AppError => new AppError('NOT_FOUND', `${entity} not found`);
export const badInput = (message: string): AppError => new AppError('BAD_USER_INPUT', message);
export const conflict = (message: string): AppError => new AppError('CONFLICT', message);

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
