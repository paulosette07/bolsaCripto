/**
 * Limpeza de texto vindo de RSS.
 *
 * Feed nenhum entrega texto puro: título vem com `&`, `&#8220;` e
 * `<![CDATA[]]>`, descrição vem com HTML inline. Estes três helpers resolvem
 * tudo antes de o conteúdo chegar à tela.
 */

/** Entidades nomeadas que aparecem de fato nos feeds brasileiros. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  deg: '°',
  euro: '€',
  pound: '£',
  copy: '©',
  reg: '®',
  trade: '™'
};

/** `&` / `&#233;` / `&#xE9;` -> caractere real. */
export function decodeHtmlEntities(value: string): string {
  if (!value.includes('&')) {
    return value;
  }

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);

      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
        return match;
      }

      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Remove tags (inclusive CDATA) e normaliza espaços. */
export function stripHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto pronto para exibição: sem tags, sem entidades, sem espaço duplicado. */
export function cleanText(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return stripHtml(decodeHtmlEntities(value));
}

/** Corta em limite de palavra, com reticências. */
export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const slice = value.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');

  return `${(lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}
