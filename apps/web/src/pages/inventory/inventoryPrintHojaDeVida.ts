import type { InventoryAssetRow, InventoryLifecycleEntry } from '../../lib/api';
import { getInventoryAsset } from '../../lib/api';
import { dStr } from './inventoryHelpers';

export type HojaDeVidaPrintMeta = {
  /** No aparece en el PDF de referencia; se conserva por compatibilidad con llamadas existentes. */
  departmentName?: string;
  organizationName: string;
  organizationNit: string;
  /** Código de formato (p. ej. MA-TIC-FM004) */
  formatCode?: string;
  elaboracion?: string;
  vigencia?: string;
  version?: string;
};

function esc(s: unknown): string {
  const t = s == null ? '' : String(s);
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function envTrim(key: string): string | undefined {
  const v = import.meta.env[key] as string | undefined;
  const t = v?.trim();
  return t || undefined;
}

/** Fechas al estilo del PDF de referencia (yyyy-mm-dd). */
function fmtDateIso(isoOrText: string): string {
  const t = isoOrText?.trim();
  if (!t) return '—';
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return t;
}

function resolveMetaExtensions(meta: HojaDeVidaPrintMeta): { elaboracion: string; vigencia: string; version: string } {
  return {
    elaboracion: meta.elaboracion?.trim() || envTrim('VITE_HV_ELABORACION') || '—',
    vigencia: meta.vigencia?.trim() || envTrim('VITE_HV_VIGENCIA') || '—',
    version: meta.version?.trim() || envTrim('VITE_HV_VERSION') || '—',
  };
}

/**
 * Tipo de mantenimiento para la columna del PDF (sin sufijo de ticket).
 * El API solo expone `summary` por entrada; fallas, piezas y limpieza quedan en blanco o "—" hasta enriquecer el modelo.
 */
function entryTipoMantenimientoPdf(entryType: string): string {
  const e = entryType.toLowerCase();
  const map: Record<string, string> = {
    corrective: 'Correctivo',
    preventive: 'Preventivo',
    revision: 'Revision',
    format: 'Formateo',
    other: 'Otro',
  };
  return map[e] ?? entryType;
}

function buildStyles(): string {
  return `
    @page { size: A4; margin: 12mm 12mm 16mm 12mm; }
    * { box-sizing: border-box; }
    html { height: 100%; }
    body {
      font-family: Arial, Helvetica, "Segoe UI", sans-serif;
      font-size: 9.5pt;
      line-height: 1.35;
      color: #111827;
      margin: 0;
      padding: 0 0 24mm 0;
      -webkit-font-smoothing: antialiased;
    }
    @media screen {
      body {
        min-height: 100%;
        background: #d8dee9;
        padding: 16px 12px 28px;
      }
      .hv-sheet {
        max-width: 210mm;
        margin: 0 auto;
        background: #fff;
        padding: 18px 20px 20px;
        border-radius: 2px;
        box-shadow: 0 4px 24px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.06);
      }
    }
    @media print {
      body { background: #fff !important; padding: 0 0 24mm 0 !important; }
      .hv-sheet { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; }
    }
    .hv-head {
      text-align: center;
      margin-bottom: 14px;
      padding: 14px 12px 16px;
      border: 1px solid #1e293b;
      border-bottom-width: 3px;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    }
    .hv-head .hv-line { margin: 0; line-height: 1.4; }
    .hv-head .hv-line--org {
      font-weight: 800;
      font-size: 12pt;
      letter-spacing: 0.02em;
      color: #0f172a;
      text-transform: uppercase;
    }
    .hv-head .hv-line--meta {
      font-weight: 600;
      font-size: 9.25pt;
      color: #334155;
      margin-top: 2px;
    }
    .hv-title {
      text-align: center;
      font-weight: 800;
      font-size: 11pt;
      letter-spacing: 0.06em;
      margin: 0 0 12px;
      padding: 8px 12px;
      color: #0f172a;
      background: #e2e8f0;
      border: 1px solid #1e293b;
      border-left: none;
      border-right: none;
      text-transform: uppercase;
    }
    .hv-block-label {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #64748b;
      margin: 10px 0 4px 2px;
    }
    .hv-title + .hv-block-label { margin-top: 6px; }
    table.hv-t {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      table-layout: fixed;
    }
    table.hv-t th, table.hv-t td {
      border: 1px solid #0f172a;
      padding: 5px 6px;
      vertical-align: top;
      word-wrap: break-word;
    }
    table.hv-t-data th {
      background: linear-gradient(180deg, #e8edf5 0%, #dce4f0 100%);
      font-weight: 700;
      font-size: 8.25pt;
      text-align: center;
      color: #0f172a;
      line-height: 1.25;
    }
    table.hv-t-data td {
      font-size: 9pt;
      background: #fff;
      color: #111827;
      min-height: 2.5em;
    }
    table.hv-t-data tr:nth-child(2) td { background: #fafbfc; }
    table.hv-t-mant {
      page-break-inside: auto;
      margin-top: 4px;
    }
    table.hv-t-mant thead { display: table-header-group; }
    table.hv-t-mant tbody tr { page-break-inside: avoid; }
    table.hv-t-mant thead th {
      background: linear-gradient(180deg, #cbd5e1 0%, #b8c4d6 100%);
      font-weight: 800;
      font-size: 7.75pt;
      text-align: center;
      color: #0f172a;
      padding: 6px 4px;
      line-height: 1.2;
    }
    table.hv-t-mant td {
      white-space: pre-wrap;
      font-size: 8.25pt;
      background: #fff;
    }
    table.hv-t-mant tbody tr:nth-child(even) td { background: #f8fafc; }
    table.hv-t-mant td:first-child { white-space: nowrap; }
    td.hv-mant-empty {
      text-align: center;
      font-style: italic;
      color: #64748b;
      padding: 14px 10px !important;
      background: #f8fafc !important;
    }
    .hv-print-footer {
      margin-top: 18px;
      padding-top: 10px;
      text-align: center;
      font-size: 8pt;
      color: #334155;
      border-top: 1px solid #cbd5e1;
    }
    .hv-print-footer .hv-pn-wrap { color: #64748b; font-weight: 600; }
    @media screen {
      .hv-print-footer .hv-pn::after,
      .hv-print-footer .hv-pt::after { content: '—'; }
    }
    @media print {
      body { padding-bottom: 24mm; }
      table.hv-t-data th,
      table.hv-t-mant thead th {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .hv-head {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .hv-print-footer {
        margin-top: 0;
        padding-top: 6px;
        border-top: none;
        position: fixed;
        left: 0;
        right: 0;
        bottom: 5mm;
        color: #000;
      }
      .hv-print-footer .hv-pn-wrap { color: #000; }
      .hv-print-footer .hv-pn::after { content: counter(page); }
      .hv-print-footer .hv-pt::after { content: counter(pages); }
    }
  `;
}

function rowBlock(labels: string[], values: string[]): string {
  const th = labels.map((l) => `<th>${esc(l)}</th>`).join('');
  const td = values.map((v) => `<td>${esc(v)}</td>`).join('');
  return `<table class="hv-t hv-t-data"><tr>${th}</tr><tr>${td}</tr></table>`;
}

function rowBlock3(labels: [string, string, string], values: [string, string, string]): string {
  return rowBlock([...labels], [...values]);
}

function buildBody(row: InventoryAssetRow, life: InventoryLifecycleEntry[], meta: HojaDeVidaPrintMeta): string {
  const d = row.details ?? {};
  const docCode =
    meta.formatCode?.trim() ||
    envTrim('VITE_HV_FORMAT_CODE') ||
    'MA-TIC-FM004';
  const ext = resolveMetaExtensions(meta);
  const footerCode = esc(row.serialNumber ?? row.id);

  const sec1 = rowBlock(
    [
      'Numero De Serie',
      'Nombre Del Computador',
      'Dirección IP',
      'Dependencia',
      'Usuario',
      'Serial',
      'Fecha Adquisición',
    ],
    [
      row.serialNumber ?? '—',
      row.name,
      dStr(d, 'dir_ip'),
      dStr(d, 'dependency_name'),
      dStr(d, 'usuario'),
      row.manufacturerSerial ?? '—',
      fmtDateIso(dStr(d, 'fecha_adquisicion')),
    ],
  );

  const sec2 = rowBlock(
    [
      'Marca',
      'Modelo',
      'Procesador',
      'Tipo De Almacenamiento',
      'Tamaño Del Disco',
      'Tarjeta Gráfica',
      'Fecha Instalación',
    ],
    [
      dStr(d, 'marca'),
      dStr(d, 'modelo'),
      dStr(d, 'procesador'),
      dStr(d, 'tp_almacenamiento'),
      dStr(d, 'tam_disco'),
      dStr(d, 'tarjeta_grafica'),
      fmtDateIso(dStr(d, 'fecha_instalacion')),
    ],
  );

  const sec3 = rowBlock(
    [
      'Tipo De RAM',
      'RAM',
      'Monitor',
      'Sistema Operativo',
      'Versión Del S.O',
      'Desc. Del Programa',
      'Remoto',
    ],
    [
      dStr(d, 'tp_ram'),
      dStr(d, 'ram'),
      dStr(d, 'monitor'),
      dStr(d, 'sis_operativo'),
      dStr(d, 'vers_sistema'),
      dStr(d, 'desc_programa'),
      dStr(d, 'remoto'),
    ],
  );

  const sec4 = rowBlock3(
    ['Estado Actual', 'Responsable Del Equipo', 'Fecha Formateo'],
    [dStr(d, 'estado_actual'), dStr(d, 'resp_equipo'), fmtDateIso(dStr(d, 'fecha_formateo'))],
  );

  // Narrativa del ticket/cierre va en "Solucion Aplicada"; el API no expone aún fallas, piezas ni limpieza por separado.
  const mantHeader = `<thead><tr>
      <th>Fecha Mantenimiento</th>
      <th>Tipo Mantenimiento</th>
      <th>Fallas Reportadas</th>
      <th>Solucion Aplicada</th>
      <th>Piezas Remplazadas</th>
      <th>Limpieza Realizada</th>
      <th>Usuario</th>
      <th>Firma</th>
    </tr></thead>`;

  const mantRows =
    life.length === 0
      ? `<tbody><tr><td class="hv-mant-empty" colspan="8">Sin registros de mantenimiento.</td></tr></tbody>`
      : `<tbody>${life
          .map((e) => {
            const tipo = entryTipoMantenimientoPdf(e.entryType);
            const sum = e.summary ?? '';
            const fallas = '—';
            const piezas = '—';
            const limpieza = '—';
            const firma = 'sin firma';
            return `<tr>
            <td>${esc(fmtDateIso(e.performedAt))}</td>
            <td>${esc(tipo)}</td>
            <td>${esc(fallas)}</td>
            <td>${esc(sum)}</td>
            <td>${esc(piezas)}</td>
            <td>${esc(limpieza)}</td>
            <td>${esc(e.performedByName)}</td>
            <td>${esc(firma)}</td>
          </tr>`;
          })
          .join('')}</tbody>`;

  return `
  <div class="hv-sheet">
  <div class="hv-head">
    <p class="hv-line hv-line--org">${esc(meta.organizationName)}</p>
    <p class="hv-line hv-line--meta">NIT. ${esc(meta.organizationNit)}</p>
    <p class="hv-line hv-line--meta">CODIGO: ${esc(docCode)}</p>
    <p class="hv-line hv-line--meta">ELABORACION: ${esc(ext.elaboracion)}</p>
    <p class="hv-line hv-line--meta">VIGENCIA: ${esc(ext.vigencia)}</p>
    <p class="hv-line hv-line--meta">VERSION: ${esc(ext.version)}</p>
  </div>
  <div class="hv-title">Formato de hoja de vida PC</div>
  <div class="hv-block-label">Identificación del equipo</div>
  ${sec1}
  <div class="hv-block-label">Hardware</div>
  ${sec2}
  <div class="hv-block-label">Software y periféricos</div>
  ${sec3}
  <div class="hv-block-label">Estado y responsable</div>
  ${sec4}
  <div class="hv-block-label">Registro de mantenimientos</div>
  <table class="hv-t hv-t-mant">${mantHeader}${mantRows}</table>
  <div class="hv-print-footer">Todos los derechos reservados<span class="hv-pn-wrap"> · Página <span class="hv-pn"></span>/<span class="hv-pt"></span></span> ${footerCode}</div>
  </div>
  `;
}

export async function openPrintHojaDeVidaPc(row: InventoryAssetRow, meta: HojaDeVidaPrintMeta): Promise<void> {
  const detail = await getInventoryAsset(row.id);
  const life: InventoryLifecycleEntry[] = Array.isArray(detail.lifecycle) ? detail.lifecycle : [];
  const w = window.open('', '_blank', 'width=960,height=720');
  if (!w) {
    window.alert('Permita ventanas emergentes para abrir la hoja de vida e imprimir o guardar como PDF.');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Hoja de vida ${esc(detail.serialNumber ?? detail.name)}</title>
  <style>${buildStyles()}</style>
</head>
<body>
${buildBody(detail, life, meta)}
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  };
}
