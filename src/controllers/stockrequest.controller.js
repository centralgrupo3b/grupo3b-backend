// Mark a stock request as fulfilled (payment received after delivered_unpaid)
export const markRequestFulfilled = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (user.role !== 'admin_central') {
      return res.status(403).json({ message: 'Solo administrador central puede marcar como completado' });
    }
    const request = await StockRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Solicitud de stock no encontrada' });
    }
    if (request.status !== 'delivered_unpaid') {
      return res.status(400).json({ message: 'Solo se pueden marcar como completado las solicitudes entregadas pero falta pago' });
    }
    request.status = 'fulfilled';
    request.processedBy = user._id;
    request.processedAt = new Date();
    request.notes = 'Pago recibido, solicitud completada';
    await request.save();
    await request.populate([
      { path: 'requestedBy', select: 'fullname email' },
      { path: 'branchId', select: 'name city' },
      { path: 'items.productId', select: 'name brand sku price' },
      { path: 'processedBy', select: 'fullname' }
    ]);
    res.json({
      message: 'Solicitud marcada como completada',
      data: request
    });
  } catch (error) {
    console.error('Error marcando como completada:', error);
    res.status(500).json({ message: 'Error al marcar como completada', error: error.message });
  }
};
// Mark a stock request as delivered but unpaid
export const markDeliveredUnpaid = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (user.role !== 'admin_central') {
      return res.status(403).json({ message: 'Solo administrador central puede marcar como entregado pero falta pago' });
    }
    const request = await StockRequest.findById(id).populate('items.productId branchId');
    if (!request) {
      return res.status(404).json({ message: 'Solicitud de stock no encontrada' });
    }
    if (request.status !== 'pending' && request.status !== 'approved') {
      return res.status(400).json({ message: 'Solo se pueden marcar solicitudes pendientes o aprobadas como entregadas pero falta pago' });
    }

    // Verify central stock is still available (ensure products are populated)
    for (const item of request.items) {
      const product = item.productId && item.productId._id ? item.productId : await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ message: `Producto ${item.productId} no encontrado` });
      }
      if ((product.centralQuantity || 0) < item.quantity) {
        return res.status(400).json({
          message: `Stock insuficiente en central para ${product.name}. Disponible: ${product.centralQuantity || 0}`
        });
      }
    }

    // Transfer stock from central to branch
    let branch = request.branchId && request.branchId._id ? request.branchId : await Branch.findById(request.branchId);
    if (!branch) {
      return res.status(400).json({ message: 'Sucursal destino no encontrada' });
    }
    if (!Array.isArray(branch.stock)) branch.stock = [];

    for (const item of request.items) {
      const product = item.productId && item.productId._id ? item.productId : await Product.findById(item.productId);

      // Decrease central quantity
      product.centralQuantity = (product.centralQuantity || 0) - item.quantity;
      if (product.centralQuantity < 0) product.centralQuantity = 0;

      // Increase branch stock (or create if doesn't exist)
      const prodIdStr = product._id ? product._id.toString() : item.productId.toString();
      const existingStock = branch.stock.find(s => s.productId && s.productId.toString() === prodIdStr);
      if (existingStock) {
        existingStock.quantity = (existingStock.quantity || 0) + item.quantity;
      } else {
        branch.stock.push({
          productId: product._id || item.productId,
          quantity: item.quantity
        });
      }

      await product.save();
    }
    await branch.save();

    request.status = 'delivered_unpaid';
    request.processedBy = user._id;
    request.processedAt = new Date();
    request.notes = 'Stock entregado, falta pago';
    await request.save();
    await request.populate([
      { path: 'requestedBy', select: 'fullname email' },
      { path: 'branchId', select: 'name city' },
      { path: 'items.productId', select: 'name brand sku price' },
      { path: 'processedBy', select: 'fullname' }
    ]);
    res.json({
      message: 'Solicitud marcada como entregado pero falta pago',
      data: request
    });
  } catch (error) {
    console.error('Error marcando como entregado pero falta pago:', error);
    res.status(500).json({ message: 'Error al marcar como entregado pero falta pago', error: error.message });
  }
};
import StockRequest from "../models/StockRequest.js";
import Product from "../models/Product.js";
import Branch from "../models/Branch.js";

// Create a new stock request (branch admin requests from central)
export const createStockRequest = async (req, res) => {
  try {
    const { items, notes } = req.body;
    const userId = req.user._id;
    const user = req.user;

    // Verify user is a branch admin (admin_sucursal)
    if (user.role !== 'admin_sucursal') {
      return res.status(403).json({ message: 'Solo administradores de sucursal pueden hacer solicitudes de stock' });
    }

    // Verify all products exist
    const productIds = items.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== items.length) {
      return res.status(400).json({ message: 'Uno o más productos no existen' });
    }

    // Verify central stock availability (optional: you can allow requests even if not in stock)
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.productId);
      if (!product) {
        return res.status(400).json({ message: `Producto ${item.productId} no encontrado` });
      }
      if (product.centralQuantity < item.quantity) {
        return res.status(400).json({ 
          message: `Stock insuficiente en central para ${product.name}. Disponible: ${product.centralQuantity}` 
        });
      }
    }

    // Create the stock request
    const stockRequest = new StockRequest({
      requestedBy: userId,
      branchId: user.branchId,
      items,
      notes,
      status: 'pending'
    });

    await stockRequest.save();
    await stockRequest.populate([
      { path: 'requestedBy', select: 'fullname email' },
      { path: 'branchId', select: 'name city' },
      { path: 'items.productId', select: 'name brand sku price' }
    ]);

    res.status(201).json({
      message: 'Solicitud de stock creada exitosamente',
      data: stockRequest
    });
  } catch (error) {
    console.error('Error creating stock request:', error);
    res.status(500).json({ message: 'Error al crear solicitud de stock', error: error.message });
  }
};

// Get stock requests (central admin sees all, branch admin sees own)
export const getStockRequests = async (req, res) => {
  try {
    const user = req.user;
    let query = {};

    // Central admin sees all requests
    // Branch admin sees only their branch's requests
    if (user.role === 'admin_sucursal') {
      query.branchId = user.branchId;
    } else if (user.role !== 'admin_central') {
      return res.status(403).json({ message: 'No autorizado para ver solicitudes de stock' });
    }

    const requests = await StockRequest.find(query)
      .populate('requestedBy', 'fullname email')
      .populate('branchId', 'name city')
      .populate('items.productId', 'name brand sku price')
      .populate('processedBy', 'fullname')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching stock requests:', error);
    res.status(500).json({ message: 'Error al obtener solicitudes de stock', error: error.message });
  }
};

// Get a specific stock request
export const getStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const request = await StockRequest.findById(id)
      .populate('requestedBy', 'fullname email')
      .populate('branchId', 'name city')
      .populate('items.productId', 'name brand sku price')
      .populate('processedBy', 'fullname');

    if (!request) {
      return res.status(404).json({ message: 'Solicitud de stock no encontrada' });
    }

    // Authorization check
    if (user.role === 'admin_sucursal' && request.branchId._id.toString() !== user.branchId.toString()) {
      return res.status(403).json({ message: 'No autorizado para ver esta solicitud' });
    }

    res.json(request);
  } catch (error) {
    console.error('Error fetching stock request:', error);
    res.status(500).json({ message: 'Error al obtener solicitud de stock', error: error.message });
  }
};

// Approve a stock request (central admin only)
export const approveStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const user = req.user;

    // Only central admin can approve
    if (user.role !== 'admin_central') {
      return res.status(403).json({ message: 'Solo administrador central puede aprobar solicitudes' });
    }

    const request = await StockRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Solicitud de stock no encontrada' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Solo se pueden aprobar solicitudes pendientes' });
    }

    // Update the request
    request.status = 'approved';
    request.processedBy = user._id;
    request.processedAt = new Date();
    if (notes) request.notes = notes;

    await request.save();
    await request.populate([
      { path: 'requestedBy', select: 'fullname email' },
      { path: 'branchId', select: 'name city' },
      { path: 'items.productId', select: 'name brand sku price' },
      { path: 'processedBy', select: 'fullname' }
    ]);

    res.json({
      message: 'Solicitud aprobada exitosamente',
      data: request
    });
  } catch (error) {
    console.error('Error approving stock request:', error);
    res.status(500).json({ message: 'Error al aprobar solicitud', error: error.message });
  }
};

// Reject a stock request (central admin only)
export const rejectStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const user = req.user;

    // Only central admin can reject
    if (user.role !== 'admin_central') {
      return res.status(403).json({ message: 'Solo administrador central puede rechazar solicitudes' });
    }

    const request = await StockRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Solicitud de stock no encontrada' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Solo se pueden rechazar solicitudes pendientes' });
    }

    // Update the request
    request.status = 'rejected';
    request.processedBy = user._id;
    request.processedAt = new Date();
    if (notes) request.notes = notes;

    await request.save();
    await request.populate([
      { path: 'requestedBy', select: 'fullname email' },
      { path: 'branchId', select: 'name city' },
      { path: 'items.productId', select: 'name brand sku price' },
      { path: 'processedBy', select: 'fullname' }
    ]);

    res.json({
      message: 'Solicitud rechazada',
      data: request
    });
  } catch (error) {
    console.error('Error rejecting stock request:', error);
    res.status(500).json({ message: 'Error al rechazar solicitud', error: error.message });
  }
};

// Fulfill a stock request (transfer from central to branch)
export const fulfillStockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Only central admin can fulfill
    if (user.role !== 'admin_central') {
      return res.status(403).json({ message: 'Solo administrador central puede procesar solicitudes' });
    }

    const request = await StockRequest.findById(id).populate('items.productId branchId');
    if (!request) {
      return res.status(404).json({ message: 'Solicitud de stock no encontrada' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ message: 'Solo se pueden procesar solicitudes aprobadas' });
    }

    // Verify central stock is still available (ensure products are populated)
    for (const item of request.items) {
      const product = item.productId && item.productId._id ? item.productId : await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ message: `Producto ${item.productId} no encontrado` });
      }
      if ((product.centralQuantity || 0) < item.quantity) {
        return res.status(400).json({
          message: `Stock insuficiente en central para ${product.name}. Disponible: ${product.centralQuantity || 0}`
        });
      }
    }

    // Transfer stock from central to branch
    let branch = request.branchId && request.branchId._id ? request.branchId : await Branch.findById(request.branchId);
    if (!branch) {
      return res.status(400).json({ message: 'Sucursal destino no encontrada' });
    }
    if (!Array.isArray(branch.stock)) branch.stock = [];

    for (const item of request.items) {
      const product = item.productId && item.productId._id ? item.productId : await Product.findById(item.productId);

      // Decrease central quantity
      product.centralQuantity = (product.centralQuantity || 0) - item.quantity;
      if (product.centralQuantity < 0) product.centralQuantity = 0;

      // Increase branch stock (or create if doesn't exist)
      const prodIdStr = product._id ? product._id.toString() : item.productId.toString();
      const existingStock = branch.stock.find(s => s.productId && s.productId.toString() === prodIdStr);
      if (existingStock) {
        existingStock.quantity = (existingStock.quantity || 0) + item.quantity;
      } else {
        branch.stock.push({
          productId: product._id || item.productId,
          quantity: item.quantity
        });
      }

      await product.save();
    }
    await branch.save();

    // Update request status
    request.status = 'fulfilled';
    request.processedBy = user._id;
    request.processedAt = new Date();
    request.notes = 'Solicitud completada y stock transferido';

    await request.save();
    await request.populate([
      { path: 'requestedBy', select: 'fullname email' },
      { path: 'branchId', select: 'name city' },
      { path: 'items.productId', select: 'name brand sku price' },
      { path: 'processedBy', select: 'fullname' }
    ]);

    res.json({
      message: 'Solicitud procesada exitosamente. Stock transferido a sucursal.',
      data: request
    });
  } catch (error) {
    console.error('Error fulfilling stock request:', error);
    res.status(500).json({ message: 'Error al procesar solicitud', error: error.message });
  }
};
