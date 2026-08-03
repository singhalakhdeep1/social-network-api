/**
 * Structured Logging Service for Social Network API
 * Implements structured logging with correlation IDs and context
 */
import { v4 as uuidv4 } from 'uuid';

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
  additionalContext?: Record<string, any>;
  error?: string;
}

export class StructuredLoggingService {
  private currentContext: LogContext | null = null;

  setContext(context: LogContext): void {
    this.currentContext = context;
  }

  getContext(): LogContext | null {
    return this.currentContext;
  }

  logInformation(message: string, additionalContext?: Record<string, any>): void {
    const logEntry = this.createLogEntry('Information', message, additionalContext, null);
    console.log(JSON.stringify(logEntry));
  }

  logWarning(message: string, additionalContext?: Record<string, any>): void {
    const logEntry = this.createLogEntry('Warning', message, additionalContext, null);
    console.warn(JSON.stringify(logEntry));
  }

  logError(message: string, error: string, additionalContext?: Record<string, any>): void {
    const logEntry = this.createLogEntry('Error', message, additionalContext, error);
    console.error(JSON.stringify(logEntry));
  }

  logAuditEvent(eventType: string, description: string, additionalContext?: Record<string, any>): void {
    const context = { ...additionalContext };
    context['auditEventType'] = eventType;
    context['auditDescription'] = description;

    const logEntry = this.createLogEntry('Audit', `AUDIT: ${description}`, context, null);
    console.log(JSON.stringify(logEntry));
  }

  static createCorrelationId(): string {
    return uuidv4();
  }

  private createLogEntry(level: string, message: string, additionalContext?: Record<string, any>, error?: string): LogEntry {
    const context = this.currentContext || this.defaultContext();

    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      additionalContext,
      error
    };
  }

  private defaultContext(): LogContext {
    return {
      correlationId: StructuredLoggingService.createCorrelationId()
    };
  }
}
