/**
 * Structured logging (HLD): JSON log entries carrying a correlation id, user and request
 * context. Context is held in AsyncLocalStorage so concurrent requests never see each
 * other's correlation id.
 */
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger';

export interface LogContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context: LogContext;
  additionalContext?: Record<string, unknown>;
  error?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export class StructuredLoggingService {
  /** Runs `fn` with `context` visible to every log call made inside it (including async continuations). */
  runWithContext<T>(context: LogContext, fn: () => T): T {
    return storage.run(context, fn);
  }

  setContext(context: LogContext): void {
    storage.enterWith(context);
  }

  getContext(): LogContext | undefined {
    return storage.getStore();
  }

  logInformation(message: string, additionalContext?: Record<string, unknown>): void {
    logger.info(message, this.entry('Information', message, additionalContext));
  }

  logWarning(message: string, additionalContext?: Record<string, unknown>): void {
    logger.warn(message, this.entry('Warning', message, additionalContext));
  }

  logError(message: string, error: string, additionalContext?: Record<string, unknown>): void {
    logger.error(message, this.entry('Error', message, additionalContext, error));
  }

  logAuditEvent(eventType: string, description: string, additionalContext?: Record<string, unknown>): void {
    logger.info(`AUDIT: ${description}`, this.entry('Audit', `AUDIT: ${description}`, { ...additionalContext, auditEventType: eventType }));
  }

  static createCorrelationId(): string {
    return uuidv4();
  }

  /** Meta passed to winston. `severity` (not `level`) so it cannot clobber winston's own level. */
  private entry(severity: string, _message: string, additionalContext?: Record<string, unknown>, error?: string): Record<string, unknown> {
    const context = this.getContext() ?? { correlationId: StructuredLoggingService.createCorrelationId() };
    return { severity, context, additionalContext, error };
  }
}

export const structuredLogger = new StructuredLoggingService();
