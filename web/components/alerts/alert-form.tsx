'use client';

import { BellPlus, Loader2, RotateCcw } from 'lucide-react';
import { useActionState, useState } from 'react';

import { createAlertAction } from '@/app/actions/alerts';
import { initialAlertState } from '@/lib/forms/states';
import { AssetSearch } from '@/components/market/asset-search';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import type { AssetSearchResult } from '@/lib/market/types';
import type { AssetType } from '@/lib/types/database';

const COOLDOWN_OPTIONS = [
  { value: '15', label: '15 minutos' },
  { value: '60', label: '1 hora' },
  { value: '240', label: '4 horas' },
  { value: '1440', label: '1 dia' }
];

export function AlertForm() {
  const [state, formAction, isPending] = useActionState(createAlertAction, initialAlertState);

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
        <label className="label" htmlFor="asset-search-alertas">
          Buscar ativo
        </label>
        <AssetSearch onSelect={handleSelect} placeholder="PETR4, BTC, ETH…" />
      </div>

      <form key={formKey} action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="crypto_id" value={cryptoId} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Código do ativo" htmlFor="alert_ticker" error={fieldErrors.ticker}>
            <Input
              id="alert_ticker"
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

          <Field label="Tipo" htmlFor="alert_asset_type" error={fieldErrors.asset_type}>
            <Select
              id="alert_asset_type"
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
            label="Condição"
            htmlFor="alert_condition"
            error={fieldErrors.condition}
          >
            <Select id="alert_condition" name="condition" defaultValue="above">
              <option value="above">Subir acima de</option>
              <option value="below">Cair abaixo de</option>
            </Select>
          </Field>

          <Field
            label="Preço-alvo (R$)"
            htmlFor="alert_target"
            error={fieldErrors.target_price}
          >
            <Input
              id="alert_target"
              name="target_price"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="45,00"
              required
              invalid={Boolean(fieldErrors.target_price)}
            />
          </Field>
        </div>

        <Field
          label="Intervalo entre avisos"
          htmlFor="alert_cooldown"
          hint="Tempo mínimo antes de avisar de novo sobre o mesmo alerta."
          error={fieldErrors.cooldown_minutes}
        >
          <Select id="alert_cooldown" name="cooldown_minutes" defaultValue="60">
            {COOLDOWN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Criando…
              </>
            ) : (
              <>
                <BellPlus className="size-4" aria-hidden="true" />
                Criar alerta
              </>
            )}
          </Button>

          <Button type="button" variant="ghost" onClick={() => setFormKey((key) => key + 1)}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Limpar
          </Button>
        </div>
      </form>
    </div>
  );
}
