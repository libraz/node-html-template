/**
 * TMPL_INCLUDE tests
 * Tests for template inclusion functionality
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { HTMLTemplate } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesPath = join(__dirname, 'fixtures', 'includes');

describe('TMPL_INCLUDE', () => {
  describe('Basic include functionality', () => {
    it('should include a simple file', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Start <TMPL_INCLUDE NAME="header.tmpl"> End',
        path: [fixturesPath]
      });
      expect(tmpl.output()).toBe('Start <h1>Site Header</h1>\n End');
    });

    it('should include multiple files', () => {
      const tmpl = new HTMLTemplate({
        filename: join(fixturesPath, 'basic.tmpl')
      });
      tmpl.param('content', 'Main content here');
      const output = tmpl.output();
      expect(output).toContain('<h1>Site Header</h1>');
      expect(output).toContain('Main content here');
      expect(output).toContain('© 2025 Test Site');
    });

    it('should support HTML comment form', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Start <!-- TMPL_INCLUDE NAME="header.tmpl" --> End',
        path: [fixturesPath]
      });
      expect(tmpl.output()).toBe('Start <h1>Site Header</h1>\n End');
    });

    it('should support single quotes', () => {
      const tmpl = new HTMLTemplate({
        scalarref: "Start <TMPL_INCLUDE NAME='header.tmpl'> End",
        path: [fixturesPath]
      });
      expect(tmpl.output()).toBe('Start <h1>Site Header</h1>\n End');
    });

    it('should support unquoted names', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Start <TMPL_INCLUDE NAME=header.tmpl> End',
        path: [fixturesPath]
      });
      expect(tmpl.output()).toBe('Start <h1>Site Header</h1>\n End');
    });
  });

  describe('Nested includes', () => {
    it('should process nested includes recursively', () => {
      const tmpl = new HTMLTemplate({
        filename: join(fixturesPath, 'nested-outer.tmpl')
      });
      tmpl.param('inner_var', 'test value');
      const output = tmpl.output();
      expect(output).toContain('Outer start');
      expect(output).toContain('Inner: test value');
      expect(output).toContain('Outer end');
    });

    it('should handle deeply nested includes', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_INCLUDE NAME="nested-outer.tmpl">',
        path: [fixturesPath]
      });
      tmpl.param('inner_var', 'deep');
      const output = tmpl.output();
      expect(output).toContain('Outer start');
      expect(output).toContain('Inner: deep');
      expect(output).toContain('Outer end');
    });
  });

  describe('Circular include detection', () => {
    it('should detect circular includes', () => {
      const result = expect(() => {
        const tmpl = new HTMLTemplate({
          filename: join(fixturesPath, 'circular-a.tmpl')
        });
        return tmpl;
      });
      result.toThrow(/Circular TMPL_INCLUDE detected/);
    });

    it('should detect self-referencing includes', () => {
      // Write self-referencing template
      const selfPath = join(fixturesPath, 'self.tmpl');
      writeFileSync(selfPath, '<TMPL_INCLUDE NAME="self.tmpl">');

      const result = expect(() => {
        const tmpl2 = new HTMLTemplate({
          filename: selfPath
        });
        tmpl2.output();
      });
      result.toThrow(/Circular TMPL_INCLUDE detected/);

      // Cleanup
      unlinkSync(selfPath);
    });
  });

  describe('max_includes depth limiting', () => {
    it('should respect max_includes limit', () => {
      // Create a chain of includes
      const chain1 = join(fixturesPath, 'chain1.tmpl');
      const chain2 = join(fixturesPath, 'chain2.tmpl');
      const chain3 = join(fixturesPath, 'chain3.tmpl');
      const chain4 = join(fixturesPath, 'chain4.tmpl');

      writeFileSync(chain1, '<TMPL_INCLUDE NAME="chain2.tmpl">');
      writeFileSync(chain2, '<TMPL_INCLUDE NAME="chain3.tmpl">');
      writeFileSync(chain3, '<TMPL_INCLUDE NAME="chain4.tmpl">');
      writeFileSync(chain4, 'End of chain');

      // Should work with high enough limit
      const tmpl1 = new HTMLTemplate({
        filename: chain1,
        max_includes: 10
      });
      expect(tmpl1.output()).toBe('End of chain');

      // Should fail with low limit
      const result = expect(() => {
        const tmpl = new HTMLTemplate({
          filename: chain1,
          max_includes: 2
        });
        return tmpl;
      });
      result.toThrow(/TMPL_INCLUDE recursion depth exceeded/);

      // Cleanup
      unlinkSync(chain1);
      unlinkSync(chain2);
      unlinkSync(chain3);
      unlinkSync(chain4);
    });

    it('should allow unlimited includes with max_includes=0', () => {
      const chain1 = join(fixturesPath, 'unlimited1.tmpl');
      const chain2 = join(fixturesPath, 'unlimited2.tmpl');

      writeFileSync(chain1, '<TMPL_INCLUDE NAME="unlimited2.tmpl">');
      writeFileSync(chain2, 'Done');

      const tmpl = new HTMLTemplate({
        filename: chain1,
        max_includes: 0
      });
      expect(tmpl.output()).toBe('Done');

      // Cleanup
      unlinkSync(chain1);
      unlinkSync(chain2);
    });
  });

  describe('die_on_missing_include option', () => {
    it('should throw error for missing include by default', () => {
      const result = expect(() => {
        const tmpl = new HTMLTemplate({
          scalarref: '<TMPL_INCLUDE NAME="nonexistent.tmpl">',
          path: [fixturesPath]
        });
        return tmpl;
      });
      result.toThrow(/nonexistent.tmpl/);
    });

    it('should throw error when die_on_missing_include is true', () => {
      const result = expect(() => {
        const tmpl = new HTMLTemplate({
          scalarref: '<TMPL_INCLUDE NAME="missing.tmpl">',
          path: [fixturesPath],
          die_on_missing_include: true
        });
        return tmpl;
      });
      result.toThrow(/missing.tmpl/);
    });

    it('should skip missing include when die_on_missing_include is false', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Before <TMPL_INCLUDE NAME="missing.tmpl"> After',
        path: [fixturesPath],
        die_on_missing_include: false
      });
      expect(tmpl.output()).toBe('Before  After');
    });

    it('should process other includes even when one is missing', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_INCLUDE NAME="header.tmpl"> <TMPL_INCLUDE NAME="missing.tmpl"> <TMPL_INCLUDE NAME="footer.tmpl">',
        path: [fixturesPath],
        die_on_missing_include: false
      });
      const output = tmpl.output();
      expect(output).toContain('Site Header');
      expect(output).toContain('© 2025 Test Site');
    });
  });

  describe('no_includes option', () => {
    it('should not process includes when no_includes is true', () => {
      // Should fail during template creation since INCLUDE tag wasn't preprocessed
      const result = expect(() => {
        const tmpl = new HTMLTemplate({
          scalarref: 'Start <TMPL_INCLUDE NAME="header.tmpl"> End',
          path: [fixturesPath],
          no_includes: true
        });
        return tmpl;
      });
      result.toThrow(/TMPL_INCLUDE tag found but not processed/);
    });
  });

  describe('search_path_on_include option', () => {
    it('should search path array for includes by default', () => {
      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_INCLUDE NAME="header.tmpl">',
        path: ['/nonexistent', fixturesPath]
      });
      expect(tmpl.output()).toContain('Site Header');
    });

    it('should work with relative paths', () => {
      const tmpl = new HTMLTemplate({
        filename: join(fixturesPath, 'basic.tmpl')
      });
      tmpl.param('content', 'test');
      const output = tmpl.output();
      expect(output).toContain('Site Header');
      expect(output).toContain('© 2025 Test Site');
    });
  });

  describe('Include with variables', () => {
    it('should process variables in included files', () => {
      const varInclude = join(fixturesPath, 'with-vars.tmpl');
      writeFileSync(varInclude, 'Hello <TMPL_VAR NAME="name">!');

      const tmpl = new HTMLTemplate({
        scalarref: 'Start: <TMPL_INCLUDE NAME="with-vars.tmpl">',
        path: [fixturesPath]
      });
      tmpl.param('name', 'World');
      expect(tmpl.output()).toBe('Start: Hello World!');

      // Cleanup
      unlinkSync(varInclude);
    });

    it('should process loops in included files', () => {
      const loopInclude = join(fixturesPath, 'with-loop.tmpl');
      writeFileSync(loopInclude, '<TMPL_LOOP NAME="items"><TMPL_VAR NAME="item">,</TMPL_LOOP>');

      const tmpl = new HTMLTemplate({
        scalarref: 'Items: <TMPL_INCLUDE NAME="with-loop.tmpl">',
        path: [fixturesPath]
      });
      tmpl.param('items', [
        { item: 'a' },
        { item: 'b' },
        { item: 'c' }
      ]);
      expect(tmpl.output()).toBe('Items: a,b,c,');

      // Cleanup
      unlinkSync(loopInclude);
    });
  });

  describe('Include error handling', () => {
    it('should throw error for include without NAME attribute', () => {
      const result = expect(() => {
        const tmpl = new HTMLTemplate({
          scalarref: '<TMPL_INCLUDE>',
          path: [fixturesPath]
        });
        return tmpl;
      });
      result.toThrow(/NAME attribute required/);
    });

    it('should throw error for empty NAME attribute', () => {
      const result = expect(() => {
        const tmpl = new HTMLTemplate({
          scalarref: '<TMPL_INCLUDE NAME="">',
          path: [fixturesPath]
        });
        return tmpl;
      });
      result.toThrow(/TMPL_INCLUDE requires NAME attribute/);
    });
  });

  describe('Include with whitespace', () => {
    it('should handle whitespace around tags', () => {
      const tmpl = new HTMLTemplate({
        scalarref: 'Start\n<TMPL_INCLUDE NAME="header.tmpl">\nEnd',
        path: [fixturesPath]
      });
      const output = tmpl.output();
      expect(output).toBe('Start\n<h1>Site Header</h1>\n\nEnd');
    });

    it('should preserve whitespace in included files', () => {
      const wsInclude = join(fixturesPath, 'with-whitespace.tmpl');
      writeFileSync(wsInclude, '  content  \n');

      const tmpl = new HTMLTemplate({
        scalarref: '<TMPL_INCLUDE NAME="with-whitespace.tmpl">',
        path: [fixturesPath]
      });
      expect(tmpl.output()).toBe('  content  \n');

      // Cleanup
      unlinkSync(wsInclude);
    });
  });
});
