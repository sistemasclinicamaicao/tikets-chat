import { AdminGthComunicacionesRecordsService } from './admin-gth-comunicaciones-records.service';

describe('AdminGthComunicacionesRecordsService.buildListWhere', () => {
  const service = Object.create(AdminGthComunicacionesRecordsService.prototype) as AdminGthComunicacionesRecordsService;
  const buildListWhere = (
    service as unknown as { buildListWhere: (q: object) => Record<string, unknown> }
  ).buildListWhere.bind(service);

  it('filtra solo activos por defecto', () => {
    const where = buildListWhere({});
    expect(where).toEqual({ AND: [{ isActive: true }] });
  });

  it('incluye inactivos cuando se solicita', () => {
    const where = buildListWhere({ includeInactive: true });
    expect(where).toEqual({});
  });

  it('combina filtros de área y foto', () => {
    const where = buildListWhere({
      includeInactive: true,
      area: 'ADMINISTRATIVA',
      hasPhoto: 'true',
    });
    expect(where).toEqual({
      AND: [
        { OR: [{ photoSizeBytes: { gt: 0 } }, { photoAttachmentId: { not: null } }] },
        { area: 'ADMINISTRATIVA' },
      ],
    });
  });

  it('añade búsqueda por texto', () => {
    const where = buildListWhere({ q: 'hemmis' });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { isActive: true },
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ fullName: { contains: 'hemmis', mode: 'insensitive' } }),
          ]),
        }),
      ]),
    );
  });
});
