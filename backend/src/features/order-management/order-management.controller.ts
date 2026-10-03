import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateOrderInput, OrderManagementService, ProductInput } from './order-management.service';

function userIdOf(req: Request): string {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException();
  return id;
}

@ApiTags('orders')
@UseGuards(JwtAuthGuard)
@Controller('api/orders')
export class OrderManagementController {
  constructor(private readonly orders: OrderManagementService) {}

  @Get('vendors')
  vendors(@Req() req: Request) {
    userIdOf(req);
    return this.orders.listVendors();
  }

  @Get('catalog')
  catalog(@Req() req: Request, @Query('vendorId') vendorId: string) {
    userIdOf(req);
    return this.orders.catalog(vendorId);
  }

  @Get('products')
  products(@Req() req: Request) {
    return this.orders.listMyProducts(userIdOf(req));
  }

  @Post('products')
  createProduct(@Req() req: Request, @Body() body: ProductInput) {
    return this.orders.createProduct(userIdOf(req), body);
  }

  @Patch('products/:id')
  updateProduct(@Req() req: Request, @Param('id') id: string, @Body() body: ProductInput) {
    return this.orders.updateProduct(userIdOf(req), id, body);
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreateOrderInput) {
    return this.orders.createOrder(userIdOf(req), body);
  }

  @Get('vendor')
  vendorQueue(@Req() req: Request) {
    return this.orders.vendorQueue(userIdOf(req));
  }

  @Get('mine')
  mine(@Req() req: Request) {
    return this.orders.myOrders(userIdOf(req));
  }

  @Get('notifications')
  notifications(@Req() req: Request) {
    return this.orders.myNotifications(userIdOf(req));
  }

  @Patch(':id/confirm')
  confirm(@Req() req: Request, @Param('id') id: string, @Body('estimatedDeliveryDate') eta: unknown) {
    return this.orders.confirmOrder(userIdOf(req), id, eta);
  }
}
