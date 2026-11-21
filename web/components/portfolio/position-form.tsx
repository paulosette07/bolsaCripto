'use client';

import { Loader2, Plus, RotateCcw } from 'lucide-react';
import { useActionState, useState } from 'react';

import { addPositionAction } from '@/app/actions/portfolio';
import { initialPositionState } from '@/lib/forms/states';
import { AssetSearch } from '@/components/market/asset-search';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import type { AssetSearchResult } from '@/lib/market/types';
import type { AssetType } from '@/lib/types/database';

/**
 * Cadastro de posição.
 *
 * O `key` no `<form>` é o mecanismo de reset: ao concluir um cadastro o usuário
 * pode clicar em "Adicionar outro" e o formulário é remontado com os campos
 * vazios. Reset por `useEffect` causaria render em cascata — e o lint do React
 * 19 bloqueia isso por padrão.
 */
export function PositionForm() {
  const [state, formAction, isPending] = useActionState(
    addPositionAction,
    initialPositionState
  );

  const [formKey, setFormKey] = useState(0);
  const [ticker, setTicker] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [cryptoId, setCryptoId] = useState('');

  function handleSelect(result: AssetSearchResult) {
    setTicker(result.ticker);
    setAssetType(result.assetType);
    setCryptoId(result.cryptoId ?? '');
  }

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <div className="space-y-4">
      {state.status === 'success' && state.message ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}

      {state.status === 'error' && state.message ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}

      <div>
        <label className="label" htmlFor="asset-search-carteira">
          Buscar ativo
        </label>
        <AssetSearch
          onSelect={handleSelect}
          placeholder="PETR4, HGLG11, BTC…"
          clearOnSelect={false}
        />
        <p className="mt-1.5 text-xs text-ink-faint">
          A busca preenche o tipo automaticamente. Você também pode digitar o código direto.
        </p>
      </div>

      <form key={formKey} action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="crypto_id" value={cryptoId} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Código do ativo" htmlFor="ticker" error={fieldErrors.ticker}>
            <Input
              id="ticker"
              name="ticker"
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="PETR4"
              maxLength={20}
              required
              autoComplete="off"
              spellCheck={false}
              invalid={Boolean(fieldErrors.ticker)}
            />
          </Field>

          <Field label="Tipo" htmlFor="asset_type" error={fieldErrors.asset_type}>
            <Select
              id="asset_type"
              name="asset_type"
              value={assetType}
              onChange={(event) => {
                const next = event.target.value === 'crypto' ? 'crypto' : 'stock';
                setAssetType(next);

                if (next === 'stock') {
                  setCryptoId('');
                }
              }}
            >
              <option value="stock">Bolsa (ação / FII)</option>
              <option value="crypto">Criptomoeda</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Quantidade"
            htmlFor="quantity"
            hint={
              assetType === 'crypto'
                ? 'Aceita frações: 0,035 BTC'
                : 'Número de cotas: 100'
            }
            error={fieldErrors.quantity}
          >
            <Input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder={assetType === 'crypto' ? '0,035' : '100'}
              required
              invalid={Boolean(fieldErrors.quantity)}
            />
          </Field>

          <Field
            label="Preço médio (opcional)"
            htmlFor="avg_price"
            hint="Usado para calcular lucro/prejuízo."
            error={fieldErrors.avg_price}
          >
            <Input
              id="avg_price"
              name="avg_price"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="38,50"
              invalid={Boolean(fieldErrors.avg_price)}
            />
          </Field>
        </div>

        <Field label="Observação (opcional)" htmlFor="notes">
          <Input
            id="notes"
            name="notes"
            type="text"
            placeholder="Ex: compra para longo prazo"
            maxLength={280}
            autoComplete="off"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Salvando…
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden="true" />
                Adicionar à carteira
              </>
            )}
          </Button>

          <Button type="button" variant="ghost" onClick={() => setFormKey((key) => key + 1)}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Limpar
          </Button>

          {state.status === 'success' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setTicker('');
                setCryptoId('');
                setFormKey((key) => key + 1);
              }}
            >
              Adicionar outro ativo
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
