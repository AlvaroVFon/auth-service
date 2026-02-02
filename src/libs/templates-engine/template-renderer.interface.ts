export interface TemplateRenderer {
  render(templatePath: string, context: Record<string, string>): string;
}
