import {
  buildGthPhotoFileName,
  buildGthEmployeeSnapshot,
  formatGthFingresoDisplay,
  gthPhotoExtensionFromMime,
} from './admin-gth-row.util';

describe('formatGthFingresoDisplay', () => {
  it('formatea ISO UTC en zona America/Bogota', () => {
    expect(formatGthFingresoDisplay('2017-01-01')).toBe('31/12/2016');
    expect(formatGthFingresoDisplay('2017-01-01T00:00:00.000Z')).toBe('31/12/2016');
  });

  it('formatea DD/MM/YYYY sin desfase de día', () => {
    expect(formatGthFingresoDisplay('01/01/2017')).toBe('01/01/2017');
  });
});

describe('buildGthPhotoFileName', () => {
  it('usa cédula y extensión desde MIME', () => {
    expect(buildGthPhotoFileName('1067896086', 'image/jpeg', 'foto.PNG')).toBe('1067896086.jpg');
  });

  it('normaliza cédula con puntos', () => {
    expect(buildGthPhotoFileName('10.678.960-86', 'image/png')).toBe('1067896086.png');
  });
});

describe('gthPhotoExtensionFromMime', () => {
  it('mapea image/webp', () => {
    expect(gthPhotoExtensionFromMime('image/webp')).toBe('webp');
  });
});

describe('buildGthEmployeeSnapshot', () => {
  it('incluye columnas de listado', () => {
    const snap = buildGthEmployeeSnapshot({
      DOC: '1067896086',
      PRIMERNOMBRE: 'Juan',
      PRIMERAPELLIDO: 'Pérez',
      CARGO: 'Analista',
      AREA: 'ADMINISTRATIVA',
      ESTADO: 'ACTIVO',
      TIPOCONTRATO: 'Indefinido',
      FINGRESO: '2017-01-01',
    });
    expect(snap.area).toBe('ADMINISTRATIVA');
    expect(snap.estado).toBe('ACTIVO');
    expect(snap.tipoContrato).toBe('Indefinido');
    expect(snap.fechaIngreso).toBe('31/12/2016');
  });
});
