import handlebars from 'handlebars';
import { getStringEnvVariable } from '../../../config/env.config';
import path from 'node:path';
import fs from 'node:fs';
import { TemplateRenderer } from '../template-renderer.interface';

export class HandlebarsEngine implements TemplateRenderer {
  private readonly templatesPath: string;

  constructor() {
    this.templatesPath = getStringEnvVariable('TEMPLATES_PATH');
  }

  render(templatePath: string, context: Record<string, string>): string {
    const filePath = path.join(this.templatesPath, `${templatePath}.hbs`);
    const templateSource = fs.readFileSync(filePath, 'utf-8');
    const compiledTemplate = handlebars.compile(templateSource);
    return compiledTemplate(context);
  }
}
