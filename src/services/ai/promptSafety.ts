/**
 * Email text is placed between <email_content> tags and the system prompt tells
 * the model to treat it as data. An email that contains a literal
 * `</email_content>` could close that block early and have the rest read as
 * instructions, so rewrite any such tags inside email-derived text.
 */
export function neutralizeEmailTags(text: string): string {
  return text.replace(/<(\s*\/?\s*)email_content/gi, "<$1email-content");
}
