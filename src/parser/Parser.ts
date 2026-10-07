/**
 * Template parser
 * Converts token stream into ParseNode AST
 *
 * Features:
 * - Single-pass parsing
 * - Nested loop/conditional handling
 * - Jump address calculation for IF/UNLESS/ELSE
 * - Comprehensive error detection
 *
 * @module parser/Parser
 */

import type { ParseNode, SourceLoc } from '../types.js';
import { templateError } from './sourceMap.js';
import type { LocatedToken as Token } from './types.js';

/**
 * Read the source position off a token.
 *
 * Only tag nodes carry a position; text nodes are far more numerous and
 * nothing needs to point at them.
 *
 * @param token - Token the node is built from
 * @returns Source position, or undefined when the tokenizer supplied none
 */
function locOf(token: Token): SourceLoc | undefined {
  if (token.line === undefined) return undefined;

  const loc: SourceLoc = { line: token.line, col: token.col ?? 1 };
  if (token.file !== undefined) loc.file = token.file;

  return loc;
}

/**
 * Parser context for tracking parsing state
 */
interface ParserContext {
  /**
   * Current token index
   */
  pos: number;

  /**
   * Token array
   */
  tokens: Token[];

  /**
   * Template filename for error messages
   */
  filename?: string;

  /**
   * Stack of open blocks (loops and conditionals)
   */
  blockStack: Array<{ type: string; name?: string; startPos: number }>;

  /**
   * Whether TMPL_INCLUDE tags are forbidden.
   */
  noIncludes: boolean;
}

/**
 * Template parser
 * Converts tokens into ParseNode tree with jump addresses
 */
export class Parser {
  private context: ParserContext;

  /**
   * Create parser
   *
   * @param tokens - Token array from tokenizer
   * @param filename - Optional filename for error messages
   */
  constructor(tokens: Token[], filename?: string, noIncludes = false) {
    this.context = {
      pos: 0,
      tokens,
      filename,
      blockStack: [],
      noIncludes
    };
  }

  /**
   * Parse tokens into ParseNode tree
   * Single-pass algorithm with jump address calculation
   *
   * @returns ParseNode array (AST)
   */
  parse(): ParseNode[] {
    const nodes: ParseNode[] = [];

    while (this.context.pos < this.context.tokens.length) {
      const token = this.currentToken();
      if (!token) break;

      const node = this.parseToken(token);
      if (node) {
        nodes.push(node);
      }

      this.context.pos += 1;
    }

    // Check for unclosed blocks
    if (this.context.blockStack.length > 0) {
      const unclosed = this.context.blockStack[this.context.blockStack.length - 1];
      if (unclosed) {
        throw this.error(
          `Unclosed ${unclosed.type} block${unclosed.name ? ` for "${unclosed.name}"` : ''}`,
          this.currentToken()
        );
      }
    }

    return nodes;
  }

  /**
   * Parse single token into ParseNode
   *
   * @param token - Current token
   * @returns ParseNode or null if token should be skipped
   */
  private parseToken(token: Token): ParseNode | null {
    switch (token.type) {
      case 'TEXT':
        return this.parseTextNode(token);

      case 'VAR':
        return this.parseVarNode(token);

      case 'LOOP':
        return this.parseLoopNode(token);

      case 'ENDLOOP':
        return this.parseEndLoopNode(token);

      case 'IF':
        return this.parseCondBlockNode(token, 'if');

      case 'UNLESS':
        return this.parseCondBlockNode(token, 'unless');

      case 'ELSE':
        return this.parseElseNode(token);

      case 'ENDIF':
        return this.parseEndIfNode(token);

      case 'INCLUDE':
        return this.parseIncludeNode(token);

      default:
        // Unknown token type - skip
        return null;
    }
  }

  /**
   * Parse TEXT token
   */
  private parseTextNode(token: Token): ParseNode {
    if (token.type !== 'TEXT') {
      throw this.error('Expected TEXT token', token);
    }

    return {
      type: 'TEXT',
      content: token.content ?? ''
    };
  }

  /**
   * Parse VAR token
   */
  private parseVarNode(token: Token): ParseNode {
    if (token.type !== 'VAR') {
      throw this.error('Expected VAR token', token);
    }

    // `escape` stays undefined when the tag carried no ESCAPE attribute, which
    // is what lets default_escape apply without overriding an explicit NONE.
    return {
      type: 'VAR',
      name: token.name ?? '',
      escape: token.escape,
      default: token.default,
      loc: locOf(token)
    };
  }

  /**
   * Parse LOOP token and its body
   */
  private parseLoopNode(token: Token): ParseNode {
    if (token.type !== 'LOOP') {
      throw this.error('Expected LOOP token', token);
    }

    const loopName = token.name ?? '';

    // Push loop onto block stack
    this.context.blockStack.push({
      type: 'LOOP',
      name: loopName,
      startPos: this.context.pos
    });

    // Parse loop body
    const body: ParseNode[] = [];
    this.context.pos += 1;

    while (this.context.pos < this.context.tokens.length) {
      const currentToken = this.currentToken();
      if (!currentToken) break;

      // Check for ENDLOOP
      if (currentToken.type === 'ENDLOOP') {
        // Pop from block stack
        const popped = this.context.blockStack.pop();
        if (popped?.type !== 'LOOP') {
          throw this.error(`Mismatched ENDLOOP - expected end of ${popped?.type ?? 'unknown'}`, currentToken);
        }

        // Create loop node with body
        return {
          type: 'LOOP',
          name: loopName,
          body,
          loc: locOf(token)
        };
      }

      // Parse body token
      const node = this.parseToken(currentToken);
      if (node) {
        body.push(node);
      }

      this.context.pos += 1;
    }

    // Reached end without ENDLOOP
    throw this.error(`Unclosed LOOP block for "${loopName}"`, token);
  }

  /**
   * Parse ENDLOOP token
   * This should not be reached during normal parsing (handled in parseLoopNode)
   */
  private parseEndLoopNode(token: Token): ParseNode | null {
    throw this.error('Unexpected ENDLOOP without matching LOOP', token);
  }

  /**
   * Parse IF or UNLESS token and its body
   */
  private parseCondBlockNode(token: Token, conditionType: 'if' | 'unless'): ParseNode {
    const blockType = conditionType === 'if' ? 'IF' : 'UNLESS';
    const conditionName = token.name ?? '';

    this.context.blockStack.push({
      type: blockType,
      name: conditionName,
      startPos: this.context.pos
    });

    const consequent: ParseNode[] = [];
    const alternate: ParseNode[] = [];
    let inElse = false;

    this.context.pos += 1;

    while (this.context.pos < this.context.tokens.length) {
      const currentToken = this.currentToken();
      if (!currentToken) break;

      if (currentToken.type === 'ELSE') {
        if (inElse) {
          throw this.error(`Multiple ELSE blocks in ${blockType}`, currentToken);
        }
        inElse = true;
        this.context.pos += 1;
        continue;
      }

      if (currentToken.type === 'ENDIF') {
        // Perl requires </TMPL_IF> for TMPL_IF and </TMPL_UNLESS> for TMPL_UNLESS.
        if (currentToken.closes !== undefined && currentToken.closes !== blockType) {
          throw this.error(
            `found </TMPL_${currentToken.closes}> incorrectly terminating a <TMPL_${blockType}> (use </TMPL_${blockType}>)`,
            currentToken
          );
        }

        const popped = this.context.blockStack.pop();
        if (popped?.type !== 'IF' && popped?.type !== 'UNLESS') {
          throw this.error(`Mismatched ENDIF - expected end of ${popped?.type ?? 'unknown'}`, currentToken);
        }

        return {
          type: 'COND',
          name: conditionName,
          condition: conditionType,
          consequent,
          alternate: alternate.length > 0 ? alternate : undefined,
          loc: locOf(token)
        };
      }

      const node = this.parseToken(currentToken);
      if (node) {
        if (inElse) {
          alternate.push(node);
        } else {
          consequent.push(node);
        }
      }

      this.context.pos += 1;
    }

    throw this.error(`Unclosed ${blockType} block for "${conditionName}"`, token);
  }

  /**
   * Parse ELSE token
   * This should not be reached during normal parsing (handled in parseIfNode/parseUnlessNode)
   */
  private parseElseNode(token: Token): ParseNode | null {
    throw this.error('Unexpected ELSE without matching IF/UNLESS', token);
  }

  /**
   * Parse ENDIF token
   * This should not be reached during normal parsing (handled in parseIfNode/parseUnlessNode)
   */
  private parseEndIfNode(token: Token): ParseNode | null {
    throw this.error('Unexpected ENDIF without matching IF/UNLESS', token);
  }

  /**
   * Parse INCLUDE token
   *
   * Note: INCLUDE processing happens at template loading phase, not during parsing.
   * If we encounter an INCLUDE token here, it means include preprocessing wasn't done.
   * This should not happen in normal operation.
   */
  private parseIncludeNode(token: Token): ParseNode | null {
    if (this.context.noIncludes) {
      throw this.error(
        'HTML::Template : Illegal attempt to use TMPL_INCLUDE in template file : (no_includes => 1)',
        token
      );
    }

    // INCLUDE tags are normally expanded during preprocessing.
    return { type: 'NOOP' };
  }

  /**
   * Build an error located at a token, in the template that contains it.
   *
   * @param message - What went wrong
   * @param token - Token the error is about, when there is one
   * @returns Error to throw
   */
  private error(message: string, token: Token | undefined): Error {
    return templateError(message, { file: token?.file ?? this.context.filename, line: token?.line });
  }

  /**
   * Get current token
   *
   * @returns Current token or undefined if at end
   */
  private currentToken(): Token | undefined {
    return this.context.tokens[this.context.pos];
  }
}
