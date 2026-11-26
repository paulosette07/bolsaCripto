/**
 * Cadência de atualização das cotações.
 *
 * Fonte única de verdade: a tela usa este número para agendar o refresh e a
 * página de configurações o exibe ao usuário. Mudar aqui muda em todo lugar.
 */

/** Intervalo entre atualizações automáticas, em minutos. */
export const REFRESH_INTERVAL_MINUTES = 5;

/** O mesmo intervalo em milissegundos, para `setInterval`/`setTimeout`. */
export const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_MINUTES * 60 * 1000;

/**
 * TTL de cache para as rotas de cotação.
 *
 * Um pouco abaixo do intervalo de refresh: quando o cliente pede de novo, o
 * cache do servidor já expirou e o preço é realmente novo.
 */
export const QUOTE_REVALIDATE_SECONDS = REFRESH_INTERVAL_MINUTES * 60 - 60;
