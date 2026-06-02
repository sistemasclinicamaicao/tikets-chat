import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_WORKFLOW_TRANSITION_PAIRS } from './default-workflow-transitions';

@Injectable()
export class TicketWorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea workflow predeterminado si el departamento no tiene transiciones (p. ej. COMUNICACIONES recién creado). */
  async ensureDefaultWorkflow(departmentId: string): Promise<void> {
    let wf = await this.prisma.workflowDefinition.findFirst({
      where: { departmentId, isActive: true },
    });
    if (!wf) {
      wf = await this.prisma.workflowDefinition.create({
        data: { departmentId, name: 'Predeterminado', isActive: true },
      });
    }

    const count = await this.prisma.workflowTransition.count({ where: { workflowId: wf.id } });
    if (count > 0) return;

    for (const [fromCode, toCode] of DEFAULT_WORKFLOW_TRANSITION_PAIRS) {
      const fromS = await this.prisma.ticketStatus.findUnique({ where: { code: fromCode } });
      const toS = await this.prisma.ticketStatus.findUnique({ where: { code: toCode } });
      if (!fromS || !toS) continue;
      await this.prisma.workflowTransition.create({
        data: {
          workflowId: wf.id,
          fromStatusId: fromS.id,
          toStatusId: toS.id,
          requiresComment: false,
          requiresResolution: false,
          requiresChecklist: false,
          requiresSupervisorApproval: false,
        },
      });
    }
  }

  async validateTransition(params: {
    departmentId: string;
    fromStatusId: string;
    toStatusId: string;
    hasComment: boolean;
    hasResolution: boolean;
    checklistDone: boolean;
    actorRole: string;
  }) {
    const loadWorkflow = () =>
      this.prisma.workflowDefinition.findFirst({
        where: { departmentId: params.departmentId, isActive: true },
        include: {
          transitions: {
            where: { fromStatusId: params.fromStatusId, toStatusId: params.toStatusId },
          },
        },
      });

    let workflow = await loadWorkflow();

    if (!workflow || workflow.transitions.length === 0) {
      await this.ensureDefaultWorkflow(params.departmentId);
      workflow = await loadWorkflow();
    }

    if (!workflow || workflow.transitions.length === 0) {
      throw new BadRequestException('Transición de estado no permitida');
    }

    const t = workflow.transitions[0];
    if (t.requiresComment && !params.hasComment) {
      throw new BadRequestException('Esta transición requiere un comentario');
    }
    if (t.requiresResolution && !params.hasResolution) {
      throw new BadRequestException('Esta transición requiere resolución registrada');
    }
    if (t.requiresChecklist && !params.checklistDone) {
      throw new BadRequestException('Esta transición requiere checklist completado');
    }
    if (t.requiresSupervisorApproval && params.actorRole !== 'supervisor' && params.actorRole !== 'admin') {
      throw new ForbiddenException('Esta transición requiere aprobación de supervisor');
    }

    return t;
  }

  /** Primera transición aplicable si no hay workflow (entornos sin semilla). */
  async findTransitionOrThrow(
    departmentId: string,
    fromStatusId: string,
    toStatusId: string,
  ) {
    const wf = await this.prisma.workflowDefinition.findFirst({
      where: { departmentId, isActive: true },
      include: {
        transitions: {
          where: { fromStatusId, toStatusId },
        },
      },
    });
    if (wf?.transitions[0]) return wf.transitions[0];
    throw new NotFoundException('Transición de workflow no encontrada');
  }
}
