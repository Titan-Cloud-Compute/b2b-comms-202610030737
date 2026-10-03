import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { GenerateInvoiceInput, InvoiceGenerationService } from './invoice-generation.service';

function userIdOf(req: Request): string {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException();
  return id;
}

@ApiTags('invoices')
@UseGuards(JwtAuthGuard)
@Controller('api/invoices')
export class InvoiceGenerationController {
  constructor(private readonly invoices: InvoiceGenerationService) {}

  @Post()
  generate(@Req() req: Request, @Body() body: GenerateInvoiceInput) {
    return this.invoices.generate(userIdOf(req), body);
  }

  @Get()
  list(@Req() req: Request, @Query('orderId') orderId?: string) {
    return this.invoices.list(userIdOf(req), orderId);
  }

  @Get(':id/download')
  async download(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.invoices.download(userIdOf(req), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.send(pdf.content);
  }
}
