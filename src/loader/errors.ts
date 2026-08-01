/**
 * Loader errors
 *
 * @module loader/errors
 */

/**
 * A template name could not be resolved to anything.
 *
 * Distinguished from every other failure because a missing include is the one
 * case callers may choose to ignore. Depth limits, cycles and read errors stay
 * fatal regardless of that setting.
 */
export class TemplateNotFoundError extends Error {
  override readonly name = 'TemplateNotFoundError';

  /** Name as written in the template */
  readonly templateName: string;

  /**
   * @param templateName - Name that could not be resolved
   * @param message - Message to report
   */
  constructor(templateName: string, message?: string) {
    super(message ?? `Cannot open included file ${templateName} : file not found`);
    this.templateName = templateName;
  }
}
