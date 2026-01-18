import Order from "../models/Order.js";
import Branch from "../models/Branch.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

/**
 * Crear una orden (pedido) y reservar stock en la sucursal correspondiente.
 * En lugar de procesar el pago en la web, se genera un enlace a WhatsApp
 * con el detalle de la compra para continuar el proceso manualmente.
 */
export async function createOrder(req, res) {
  try {
    console.log('createOrder - Request body:', JSON.stringify(req.body, null, 2));
    console.log('createOrder - User:', req.user);

    const { branchId, items, paymentMethod, deliveryMethod, deliveryAddress, customerName, customerEmail, customerPhone, notes, customTotal } = req.body;
    
    // Validaciones básicas
    if (!branchId) return res.status(400).json({ message: "branchId es requerido" });
    if (!mongoose.Types.ObjectId.isValid(branchId)) return res.status(400).json({ message: "branchId inválido" });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Items son requeridos" });
    
    // Validar que cada item tenga los campos requeridos
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productId) return res.status(400).json({ message: `Item ${i + 1}: productId es requerido` });
      if (!mongoose.Types.ObjectId.isValid(item.productId)) return res.status(400).json({ message: `Item ${i + 1}: productId inválido` });
      if (!item.quantity || item.quantity <= 0) return res.status(400).json({ message: `Item ${i + 1}: quantity debe ser un número positivo` });
      if (!item.price || item.price <= 0) return res.status(400).json({ message: `Item ${i + 1}: price debe ser un número positivo` });
    }
    
    // customerName, customerEmail, customerPhone son opcionales según el modelo
    
    // Determinar si es una venta manual (desde admin) o pedido web
    // Solo aprobar automáticamente si el usuario tiene rol de admin o isAdmin=true
    const isAdminUser = req.user && (req.user.role === 'admin_sucursal' || req.user.role === 'admin_central' || req.user.isAdmin === true);
    console.log('createOrder - isAdminUser:', isAdminUser, 'user role:', req.user?.role, 'isAdmin:', req.user?.isAdmin);
    
    // 1️⃣ Verificamos que la sucursal exista
    const branch = await Branch.findById(branchId);
    if (!branch) return res.status(400).json({ message: "Sucursal no encontrada" });

    // Verify paymentMethod is provided and valid
    if (!paymentMethod || !['efectivo', 'débito', 'billetera virtual'].includes(paymentMethod)) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }

    // Verify deliveryMethod is provided and valid
    if (!deliveryMethod || !['pickup', 'delivery'].includes(deliveryMethod)) {
      return res.status(400).json({ message: "Método de entrega inválido" });
    }

    // If delivery method is 'delivery', validate delivery address and prevent cash payment
    if (deliveryMethod === 'delivery') {
      if (!deliveryAddress || !deliveryAddress.address || !deliveryAddress.city || !deliveryAddress.postalCode) {
        return res.status(400).json({ message: "Dirección de entrega requerida para envío a domicilio" });
      }
      if (paymentMethod === 'efectivo') {
        return res.status(400).json({ message: "El pago en efectivo no está disponible para entregas a domicilio" });
      }
    }

    // Reservar stock por cada producto
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({ message: "Item inválido: productId y quantity positiva requeridos" });
      }

      const product = await Product.findById(item.productId);
      if (!product) return res.status(400).json({ message: `Producto ${item.productId} no encontrado` });

      // Buscar el item de stock, soportando distintos esquemas antiguos/nuevos
      const stockItem = branch.stock.find(s => {
        const sid = s.productId?._id ? s.productId._id.toString() : (s.productId || s.product);
        return sid?.toString() === (item.productId?.toString ? item.productId.toString() : item.productId);
      });

      const available = (stockItem && (stockItem.quantity ?? stockItem.availableQuantity ?? 0));
      if (!stockItem || available < item.quantity) {
        return res.status(400).json({ message: `Stock insuficiente para ${product.name}. Disponible: ${available}, solicitado: ${item.quantity}` });
      }

      // Para ventas manuales (approved), reducir stock disponible directamente
      // Para pedidos web (pending), reservar stock
      if (isAdminUser) {
        // Venta manual: reducir stock disponible directamente
        if (stockItem.quantity !== undefined) {
          stockItem.quantity = stockItem.quantity - item.quantity;
        } else if (stockItem.availableQuantity !== undefined) {
          stockItem.availableQuantity = stockItem.availableQuantity - item.quantity;
        }
      } else {
        // Pedido web: reservar stock
        if (stockItem.quantity !== undefined) {
          stockItem.quantity = stockItem.quantity - item.quantity;
        } else if (stockItem.availableQuantity !== undefined) {
          stockItem.availableQuantity = stockItem.availableQuantity - item.quantity;
        }
        stockItem.reservedQuantity = (stockItem.reservedQuantity ?? 0) + item.quantity;
      }
    }

    // Guardar cambios en la sucursal
    console.log('createOrder - Saving branch changes...');
    await branch.save();
    console.log('createOrder - Branch saved successfully');

    // Calcular total y almacenar precio base al momento de la venta si viene desde el cliente
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      
      // Asegurar que los valores sean números
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.price);
      
      // basePriceAtSale preferiblemente enviado por el cliente (frontend), si no, calcular desde product.price
      let basePriceAtSale = null;
      if (item.basePriceAtSale !== undefined && item.basePriceAtSale !== null) {
        basePriceAtSale = Number(item.basePriceAtSale);
        // basePriceAtSale ya viene convertido del frontend para ventas manuales
      } else if (product && typeof product.price === 'number') {
        // intentamos usar price del producto (puede ser USD o ARS según configuración del frontend)
        // si el frontend no envía la tasa de conversión, guardamos el valor de product.price como fallback
        basePriceAtSale = Number(product.price);
      }

      orderItems.push({
        product: item.productId,
        quantity: quantity,
        unitPrice: unitPrice,
        basePriceAtSale: basePriceAtSale
      });
    }

    console.log('createOrder - Order items:', JSON.stringify(orderItems, null, 2));

    const calculatedTotal = orderItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
    const total = (customTotal !== undefined && customTotal !== null) ? Number(customTotal) : calculatedTotal;

    // Validar enums antes de crear la orden
    const validPaymentMethods = ['efectivo', 'débito', 'billetera virtual'];
    const validDeliveryMethods = ['pickup', 'delivery'];
    
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({ message: `Método de pago inválido: ${paymentMethod}. Valores válidos: ${validPaymentMethods.join(', ')}` });
    }
    
    if (!validDeliveryMethods.includes(deliveryMethod)) {
      return res.status(400).json({ message: `Método de entrega inválido: ${deliveryMethod}. Valores válidos: ${validDeliveryMethods.join(', ')}` });
    }

    console.log('createOrder - Creating order with status:', isAdminUser ? "approved" : "pending");

    const orderData = {
      user: req.user?.id || null,
      branch: branchId,
      items: orderItems,
      total,
      paymentMethod: paymentMethod,
      deliveryMethod: deliveryMethod,
      deliveryAddress: deliveryMethod === 'delivery' ? deliveryAddress : null,
      customerName: customerName,
      customerEmail: customerEmail,
      customerPhone: customerPhone,
      status: isAdminUser ? "approved" : "pending",
      notes: notes || null
    };

    console.log('createOrder - Order data:', JSON.stringify(orderData, null, 2));

    try {
      const order = await Order.create(orderData);
      console.log('createOrder - Order created successfully:', order._id);

      // Generamos el mensaje de WhatsApp
      // Usamos el número de teléfono de la sucursal como destino
      if (!branch.number) {
        return res.status(400).json({ message: "La sucursal no tiene número de teléfono configurado" });
      }
      const phone = branch.number.replace(/\D/g, ''); // Remover caracteres no numéricos
      
      if (!phone || phone.length < 10) {
        return res.status(400).json({ message: "Número de teléfono de sucursal inválido" });
      }
      
      // Construimos el mensaje de WhatsApp
      let message = `Hola! Quiero confirmar mi orden:\n\n`;
      message += `🧾 Número de orden: ${order._id}\n`;
      message += `👤 Cliente: ${customerName}\n`;
      message += `📧 Email: ${customerEmail}\n`;
      message += `📱 Teléfono: ${customerPhone}\n\n`;
      message += `🏢 Sucursal: ${branch.name}\n☎️ Contacto: ${branch.number}\n\n`;
      message += `🛍️ Productos:\n`;

      for (const item of orderItems) {
        const product = await Product.findById(item.product);
        if (product) {
          message += `• ${item.quantity} × ${product.name} - $${item.unitPrice}\n`;
        }
      }

      message += `\nTotal: ${total} ARS\n`;
      message += `💳 Método de pago: ${paymentMethod}\n`;
      message += `🚚 Método de entrega: ${deliveryMethod === 'pickup' ? 'Retiro en tienda' : 'Envío a domicilio'}\n`;
      
      if (deliveryMethod === 'delivery' && deliveryAddress) {
        message += `📍 Dirección de entrega: ${deliveryAddress.address}, ${deliveryAddress.city}, CP: ${deliveryAddress.postalCode}\n`;
      }
      
      if (branch.address) {
        message += `🏢 Dirección sucursal: ${branch.address}\n`;
      }
      message += `📌 Ciudad: ${branch.city}`;

      const encodedMessage = encodeURIComponent(message);
      const whatsappLink = `https://wa.me/${phone}?text=${encodedMessage}`;

      return res.json({ 
        message: "Orden creada y stock reservado", 
        order, 
        whatsappLink,
        branchNumber: branch.number,
        branchName: branch.name,
        branchAddress: branch.address
      });

    } catch (validationError) {
      console.error('createOrder - Validation error:', validationError);
      return res.status(400).json({ message: "Error de validación", error: validationError.message, details: validationError.errors });
    }

  } catch (err) {
    console.error('createOrder - ERROR:', err);
    console.error('createOrder - Error stack:', err.stack);
    console.error('createOrder - Error message:', err.message);
    return res.status(500).json({ message: "Error creando orden", error: err.message, stack: err.stack });
  }
}

// Obtener órdenes, opcionalmente filtradas por sucursal
export async function getOrders(req, res) {
  try {
    const { branchId } = req.query;
    const filter = {};
    if (branchId) filter.branch = branchId;

    const orders = await Order.find(filter)
      .populate('user', 'fullname email')
      .populate('branch', 'name city')
      .populate('items.product', 'name sku price')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ data: orders });
  } catch (err) {
    return res.status(500).json({ message: 'Error obteniendo órdenes', error: err.message });
  }
}

// Aprobar una orden: estado -> 'approved', y confirmar la venta (reducir reservedQuantity)
export async function approveOrder(req, res) {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('branch').populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status !== 'pending') return res.status(400).json({ message: 'Order is not pending' });

    // Authorization: branch admins only for their branch
    if (req.user && req.user.role === 'admin_sucursal') {
      const userBranchId = typeof req.user.branchId === 'object' && req.user.branchId?._id ? String(req.user.branchId._id) : String(req.user.branchId);
      const orderBranchId = order.branch ? String(order.branch._id || order.branch) : null;
      if (userBranchId !== orderBranchId) return res.status(403).json({ message: 'No permission for this branch' });
    }

    const branch = await Branch.findById(order.branch._id || order.branch);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    for (const it of order.items) {
      const prodId = String(it.product._id || it.product);
      const qty = it.quantity || it.qty || 0;
      const stockItem = branch.stock.find(s => String(s.productId?._id || s.product?._id || s.productId || s.product || s._id) === prodId);
      if (!stockItem) continue;

      if (typeof stockItem.reservedQuantity === 'number') {
        stockItem.reservedQuantity = Math.max(0, (stockItem.reservedQuantity || 0) - qty);
      }
      // When approving we DO NOT add back to available; available was already decreased when reserving
    }

    order.status = 'approved';
    await branch.save();
    await order.save();

    return res.json({ message: 'Order approved' });
  } catch (err) {
    console.error('approveOrder error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Rechazar una orden: estado -> 'rejected', devolver stock reservado a la sucursal
export async function rejectOrder(req, res) {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('branch').populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status !== 'pending') return res.status(400).json({ message: 'Order is not pending' });

    if (req.user && req.user.role === 'admin_sucursal') {
      const userBranchId = typeof req.user.branchId === 'object' && req.user.branchId?._id ? String(req.user.branchId._id) : String(req.user.branchId);
      const orderBranchId = order.branch ? String(order.branch._id || order.branch) : null;
      if (userBranchId !== orderBranchId) return res.status(403).json({ message: 'No permission for this branch' });
    }

    const branch = await Branch.findById(order.branch._id || order.branch);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    for (const it of order.items) {
      const prodId = String(it.product._id || it.product);
      const qty = it.quantity || it.qty || 0;
      const stockItem = branch.stock.find(s => String(s.productId?._id || s.product?._id || s.productId || s.product || s._id) === prodId);
      if (!stockItem) continue;

      // reduce reserved
      if (typeof stockItem.reservedQuantity === 'number') {
        stockItem.reservedQuantity = Math.max(0, (stockItem.reservedQuantity || 0) - qty);
      }
      // restore available
      if (typeof stockItem.quantity === 'number') {
        stockItem.quantity = (stockItem.quantity || 0) + qty;
      } else if (typeof stockItem.availableQuantity === 'number') {
        stockItem.availableQuantity = (stockItem.availableQuantity || 0) + qty;
      }
    }

    order.status = 'rejected';
    await branch.save();
    await order.save();

    return res.json({ message: 'Order rejected and stock restored' });
  } catch (err) {
    console.error('rejectOrder error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Obtener una orden por ID
export async function getOrderById(req, res) {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId)
      .populate('user', 'fullname email')
      .populate('branch', 'name city number')
      .populate('items.product', 'name sku price')
      .lean();

    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Authorization: if admin_sucursal, ensure same branch
    if (req.user && req.user.role === 'admin_sucursal') {
      const userBranchId = typeof req.user.branchId === 'object' && req.user.branchId?._id ? String(req.user.branchId._id) : String(req.user.branchId);
      const orderBranchId = order.branch ? String(order.branch._id || order.branch) : null;
      if (userBranchId !== orderBranchId) return res.status(403).json({ message: 'No permission for this branch' });
    }

    return res.json({ data: order });
  } catch (err) {
    console.error('getOrderById error', err);
    return res.status(500).json({ message: 'Error obteniendo orden', error: err.message });
  }
}

// Obtener estadísticas de ventas por producto para una sucursal
export async function getSalesStats(req, res) {
  try {
    const { branchId, paymentMethod } = req.query;
    
    if (!branchId) {
      return res.status(400).json({ message: 'branchId es requerido' });
    }

    const filter = { 
      branch: branchId,
      status: { $in: ['approved', 'pending', 'devolucion', 'modificado'] }
    };

    // Filtro por método de pago
    if (paymentMethod) {
      filter.paymentMethod = paymentMethod;
    }

    // Obtener órdenes relevantes de la sucursal (incluye ventas y devoluciones/modificaciones)
    const orders = await Order.find(filter)
      .populate('items.product', 'name sku brand type')
      .lean();

      // Agrupar por producto y sumar cantidades, separando devoluciones
    const salesMap = {};
    
    orders.forEach(order => {
      order.items.forEach(item => {
        const productId = String(item.product?._id || item.product);
        const productName = item.product?.name || 'Producto desconocido';
        const sku = item.product?.sku || '';
        
        if (!salesMap[productId]) {
          salesMap[productId] = {
            productId,
            name: productName,
            sku,
            sold: 0,
            returned: 0
          };
        }
        const qty = item.quantity || 0;
        if (String(item.status || 'normal') === 'devolucion') {
          salesMap[productId].returned += qty;
        } else {
          salesMap[productId].sold += qty;
        }
      });
    });

    // Convertir a array y ordenar por cantidad vendida descendente
    const stats = Object.values(salesMap)
      .sort((a, b) => b.sold - a.sold);

    return res.json({ data: stats });
  } catch (err) {
    console.error('getSalesStats error', err);
    return res.status(500).json({ message: 'Error obteniendo estadísticas de ventas', error: err.message });
  }
}

// Obtener detalle de todas las ventas con soporte para filtros por fecha
export async function getSalesDetail(req, res) {
  try {
    const { branchId, startDate, endDate, month, year, paymentMethod } = req.query;
    
    if (!branchId) {
      return res.status(400).json({ message: 'branchId es requerido' });
    }

    const filter = { 
      branch: branchId,
      // Incluir órdenes de ventas, devoluciones, modificaciones y rechazos para visualización y métricas
      status: { $in: ['approved', 'pending', 'rejected', 'devolucion', 'modificado'] }
    };

    // Filtro por método de pago
    if (paymentMethod) {
      filter.paymentMethod = paymentMethod;
    }

    // Aplicar filtros de fecha
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const startDateTime = new Date(startDate);
        startDateTime.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = startDateTime;
      }
      if (endDate) {
        // Crear fecha final incluyendo todo el día especificado
        const [year, month, day] = endDate.split('-');
        const endDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 23, 59, 59, 999);
        filter.createdAt.$lte = endDateTime;
      }
    }

    // Filtro por mes (formato: YYYY-MM)
    if (month) {
      const [monthYear, monthNum] = month.split('-');
      const startOfMonth = new Date(parseInt(monthYear), parseInt(monthNum) - 1, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(parseInt(monthYear), parseInt(monthNum), 0, 23, 59, 59, 999);
      filter.createdAt = {
        $gte: startOfMonth,
        $lte: endOfMonth
      };
    }

    // Filtro por año
    if (year && !month) {
      const yearNum = parseInt(year);
      const startOfYear = new Date(yearNum, 0, 1, 0, 0, 0, 0);
      const endOfYear = new Date(yearNum, 11, 31, 23, 59, 59, 999);
      filter.createdAt = {
        $gte: startOfYear,
        $lte: endOfYear
      };
    }

    const orders = await Order.find(filter)
      .populate('user', 'fullname email')
      .populate('branch', 'name city')
      .populate('items.product', 'name sku price brand')
      .sort({ createdAt: -1 })
      .lean();

    // Log para debuggear datos de usuario
    console.log('📋 getSalesDetail - Órdenes obtenidas:', orders.length);
    if (orders.length > 0) {
      console.log('👤 Primera orden - user data:', orders[0].user);
    }

    // Calcular métricas
    // Solo contar órdenes aprobadas y modificadas para el monto y cantidad de pedidos vendidos
    const approvedOrders = orders.filter(o => o.status === 'approved' || o.status === 'modificado');
    const totalOrders = approvedOrders.length;
    // Calcular cantidad vendida (solo órdenes aprobadas y modificadas, excluyendo ítems devueltos)
    const totalQuantity = approvedOrders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => {
        if (String(item.status || 'normal') === 'devolucion') return itemSum;
        return itemSum + (item.quantity || 0);
      }, 0);
    }, 0);
    // Contar total de items devueltos (de TODAS las órdenes)
    const totalReturned = orders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => itemSum + ((String(item.status || 'normal') === 'devolucion') ? (item.quantity || 0) : 0), 0);
    }, 0);
    // Monto total vendido (solo órdenes aprobadas y modificadas, excluyendo ítems devueltos)
    const totalAmount = approvedOrders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => {
        if (String(item.status || 'normal') === 'devolucion') return itemSum;
        return itemSum + ((item.quantity || 0) * (item.unitPrice || 0));
      }, 0);
    }, 0);

    // Ganancia total (solo órdenes aprobadas y modificadas). Si el item incluye `basePriceAtSale`, se usa.
    // En caso contrario, intentamos usar item.product.price (fallback).
    const totalProfit = approvedOrders.reduce((sumOrders, order) => {
      // Para ventas manuales (con customerName), usar precio final - costo total estimado
      // IMPORTANTE: excluir ítems marcados como 'devolucion' del cálculo de costo
      if (order.customerName) {
        const totalCost = (order.items || []).reduce((sum, item) => {
          if (String(item.status || 'normal') === 'devolucion') return sum;
          const base = (item.basePriceAtSale !== undefined && item.basePriceAtSale !== null)
            ? Number(item.basePriceAtSale)
            : Number(item.product?.price || 0);
          const qty = Number(item.quantity || 0);
          return sum + (base * qty);
        }, 0);
        return sumOrders + (Number(order.total || 0) - totalCost);
      }
      const itemsProfit = (order.items || []).reduce((sumItems, item) => {
        if (String(item.status || 'normal') === 'devolucion') return sumItems;
        const qty = Number(item.quantity || 0);
        const unit = Number(item.unitPrice || 0);
        let base = (item.basePriceAtSale !== undefined && item.basePriceAtSale !== null)
          ? Number(item.basePriceAtSale)
          : Number(item.product?.price || 0);
        // Protección contra valores de base absurdos (por ejemplo doble conversión). Si la base
        // es mucho mayor que el precio vendido, usamos el fallback product.price.
        if (isFinite(base) && isFinite(unit) && base > unit * 100) {
          base = Number(item.product?.price || 0);
        }
        
        return sumItems + ((unit - base) * qty);
      }, 0);
      return sumOrders + itemsProfit;
    }, 0);

    return res.json({ 
      data: orders,
      metrics: {
        totalOrders,
        totalQuantity,
        totalReturned,
        totalAmount,
        totalProfit,
        averageOrder: totalOrders > 0 ? (totalAmount / totalOrders).toFixed(2) : 0
      }
    });
  } catch (err) {
    console.error('getSalesDetail error', err);
    return res.status(500).json({ message: 'Error obteniendo detalle de ventas', error: err.message });
  }
}

// Actualizar una orden: modificar estado y/o items (ajusta stock y recalcula total)
export async function updateOrder(req, res) {
  try {
    const { orderId } = req.params;
    const { items: newItems, status: newStatus } = req.body;

    const order = await Order.findById(orderId).populate('items.product').populate('branch');
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });

    // Authorization: branch admins only for their branch
    if (req.user && req.user.role === 'admin_sucursal') {
      const userBranchId = typeof req.user.branchId === 'object' && req.user.branchId?._id ? String(req.user.branchId._id) : String(req.user.branchId);
      const orderBranchId = order.branch ? String(order.branch._id || order.branch) : null;
      if (userBranchId !== orderBranchId) return res.status(403).json({ message: 'No permission for this branch' });
    }

    const branch = await Branch.findById(order.branch._id || order.branch);
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });

    // Normalize new items and include item-level status
    const normalizedNew = Array.isArray(newItems) ? newItems.map(i => ({ product: i.product, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), status: i.status || 'normal' })) : null;

    // If order-level status is 'devolucion' and no items payload sent, mark all existing items as returned and save
    if (!normalizedNew && String(newStatus) === 'devolucion') {
      order.items = order.items.map(it => ({ product: it.product, quantity: it.quantity, unitPrice: it.unitPrice, status: 'devolucion' }));
      order.status = 'devolucion';
      await order.save();
      return res.json({ message: 'Orden marcada como devolucion', order });
    }

    // If order-level status is 'devolucion' and items provided, mark all provided items as returned
    if (normalizedNew && String(newStatus) === 'devolucion') {
      normalizedNew.forEach(it => it.status = 'devolucion');
    }

    // Build maps (including status)
    const oldMap = new Map();
    order.items.forEach(it => oldMap.set(String(it.product._id || it.product), { quantity: Number(it.quantity || 0), unitPrice: Number(it.unitPrice || 0), basePriceAtSale: (it.basePriceAtSale !== undefined ? it.basePriceAtSale : null), status: String(it.status || 'normal') }));

    const newMap = new Map();
    if (normalizedNew) normalizedNew.forEach(it => newMap.set(String(it.product), { quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), basePriceAtSale: (it.basePriceAtSale !== undefined ? it.basePriceAtSale : null), status: String(it.status || 'normal') }));

    // Compute diffs and apply to branch stock
    const allProductIds = new Set([...oldMap.keys(), ...(normalizedNew ? [...newMap.keys()] : [])]);

    for (const pid of allProductIds) {
      const oldEntry = oldMap.get(pid) || { quantity: 0, unitPrice: 0, status: 'normal' };
      const newEntry = newMap.get(pid) || { quantity: 0, unitPrice: 0, status: 'normal' };
      const oldQty = oldEntry.quantity || 0;
      const newQty = newEntry.quantity || 0;
      const delta = newQty - oldQty; // positive => need to reserve/reduce stock; negative => return

      // If either old or new item status is 'devolucion', skip stock adjustments for this product
      const oldStatus = String(oldEntry.status || 'normal');
      const newItemStatus = String(newEntry.status || 'normal');
      const skipStock = (oldStatus === 'devolucion' || newItemStatus === 'devolucion');

      if (delta === 0 || skipStock) {
        // If skipping stock adjustments but quantities changed, we simply accept the change without touching stock
        if (delta === 0) continue;
        // allow update of quantities without touching stock when devolucion involved
        continue;
      }

      // Find stock item
      const stockItem = branch.stock.find(s => {
        const sid = s.productId?._id ? s.productId._id.toString() : (s.productId || s.product);
        return sid?.toString() === pid;
      });

      if (!stockItem) {
        return res.status(400).json({ message: `Stock item no encontrado para producto ${pid}` });
      }

      // Handle increase
      if (delta > 0) {
        // If order is pending/modificado: reduce available and increase reserved
        if (order.status === 'pending' || newStatus === 'pending' || order.status === 'modificado' || newStatus === 'modificado') {
          const available = (stockItem.quantity !== undefined) ? stockItem.quantity : (stockItem.availableQuantity !== undefined ? stockItem.availableQuantity : 0);
          if (available < delta) return res.status(400).json({ message: `Stock insuficiente para producto ${pid}` });

          if (stockItem.quantity !== undefined) stockItem.quantity = stockItem.quantity - delta;
          else if (stockItem.availableQuantity !== undefined) stockItem.availableQuantity = stockItem.availableQuantity - delta;

          stockItem.reservedQuantity = (stockItem.reservedQuantity || 0) + delta;
        } else if (order.status === 'approved' || newStatus === 'approved') {
          // Approved sale: reduce available
          const available = (stockItem.quantity !== undefined) ? stockItem.quantity : (stockItem.availableQuantity !== undefined ? stockItem.availableQuantity : 0);
          if (available < delta) return res.status(400).json({ message: `Stock insuficiente para producto ${pid}` });
          if (stockItem.quantity !== undefined) stockItem.quantity = stockItem.quantity - delta;
          else if (stockItem.availableQuantity !== undefined) stockItem.availableQuantity = stockItem.availableQuantity - delta;
        }
      }

      // Handle decrease
      if (delta < 0) {
        const dec = -delta;
        if (order.status === 'pending' || newStatus === 'pending' || order.status === 'modificado' || newStatus === 'modificado') {
          // Reduce reserved and return to available
          stockItem.reservedQuantity = Math.max(0, (stockItem.reservedQuantity || 0) - dec);
          if (stockItem.quantity !== undefined) stockItem.quantity = (stockItem.quantity || 0) + dec;
          else if (stockItem.availableQuantity !== undefined) stockItem.availableQuantity = (stockItem.availableQuantity || 0) + dec;
        } else if (order.status === 'approved' || newStatus === 'approved') {
          // Approved sale: return to available
          if (stockItem.quantity !== undefined) stockItem.quantity = (stockItem.quantity || 0) + dec;
          else if (stockItem.availableQuantity !== undefined) stockItem.availableQuantity = (stockItem.availableQuantity || 0) + dec;
        }
      }
    }

    // Apply new items and status (preserve per-item status)
    if (normalizedNew) {
      order.items = normalizedNew.map(it => {
        const pid = String(it.product);
        const old = oldMap.get(pid) || {};
        return ({ product: it.product, quantity: it.quantity, unitPrice: it.unitPrice, status: it.status || 'normal', basePriceAtSale: (it.basePriceAtSale !== undefined && it.basePriceAtSale !== null) ? it.basePriceAtSale : (old.basePriceAtSale !== undefined ? old.basePriceAtSale : null) });
      });
      order.total = order.items.reduce((s, it) => {
        if (String(it.status || 'normal') === 'devolucion') return s;
        return s + (it.quantity * it.unitPrice || 0);
      }, 0);
    }

    if (typeof newStatus === 'string') order.status = newStatus;

    await branch.save();
    await order.save();

    return res.json({ message: 'Orden actualizada', order });
  } catch (err) {
    console.error('updateOrder error', err);
    return res.status(500).json({ message: 'Error actualizando orden', error: err.message });
  }
}