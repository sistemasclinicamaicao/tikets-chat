import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TicketWorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async validateTransition(params: {
    departmentId: string;
    fromStatusId: string;
    toStatusId: string;
    hasComment: boolean;
    hasResolution: boolean;
    checklistDone: boolean;
    actorRole: string;
  }) {
    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { departmentId: params.departmentId, isActive: true },
      include: {
        transitions: {
          where: { fromStatusId: params.fromStatusId, toStatusId: params.toStatusId },
        },
      },
    });

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
