// Исходящие сообщения уходят с format: 'markdown' — любой пользовательский текст в них
// (название вакансии, имя, контакт) нужно экранировать этой функцией.
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_\[\]()~>#+\-=|{}.!])/g, '\\$1');
}
