import { HandlebarsEngine } from '../../../../../src/libs/templates-engine/adapters/handlebars.adapter';
import { MailTemplate } from '../../../../../src/mail/mail.enum';

describe('HandlebarsEngine', () => {
  let engine: HandlebarsEngine;

  beforeEach(() => {
    engine = new HandlebarsEngine();
  });

  describe('render()', () => {
    test('should interpolate context values into the template', () => {
      const html = engine.render(MailTemplate.WELCOME, {
        appName: 'Auth Service',
        userName: 'user@example.com',
        link: 'https://example.com/verify',
        year: '2026',
      });

      assert.match(html, /user@example\.com/);
      assert.match(html, /Auth Service/);
      assert.match(html, /2026/);
      assert.doesNotMatch(html, /\{\{/);
    });

    test('should render signup and reset templates with their own placeholders', () => {
      const signup = engine.render(MailTemplate.SIGNUP_VERIFICATION, {
        appName: 'Auth Service',
        code: '123456',
        link: 'https://example.com/confirm',
        year: '2026',
      });
      const reset = engine.render(MailTemplate.RESET_PASSWORD, {
        appName: 'Auth Service',
        username: 'jane',
        email: 'jane@example.com',
        code: '654321',
        year: '2026',
      });

      assert.match(signup, /123456/);
      assert.match(signup, /https:\/\/example\.com\/confirm/);
      assert.match(reset, /jane@example\.com/);
      assert.match(reset, /654321/);
      assert.doesNotMatch(signup, /\{\{/);
      assert.doesNotMatch(reset, /\{\{/);
    });

    test('should render missing context keys as empty strings', () => {
      const html = engine.render(MailTemplate.WELCOME, { appName: 'Auth' });

      assert.doesNotMatch(html, /\{\{userName\}\}/);
      assert.doesNotMatch(html, /\{\{/);
    });

    test('should throw when the template file does not exist', () => {
      assert.throws(() => engine.render('does_not_exist', {}), /ENOENT/);
    });
  });
});
