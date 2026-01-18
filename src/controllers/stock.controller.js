import StockMovement from '../models/StockMovement.js';
import Branch from '../models/Branch.js';

// Obtener historial de movimientos. Opcional filter by branchId
export async function getStockMovements(req, res) {
  try {
    const { branchId } = req.query;
    const filter = {};
    if (branchId) filter.toBranch = branchId;

    const movements = await StockMovement.find(filter)
      .populate('user', 'username fullname')
      .populate('product', 'name sku')
      .populate('toBranch', 'name city')
      .sort({ createdAt: -1 })
      .limit(200);

    return res.json(movements);
  } catch (err) {
    return res.status(500).json({ message: 'Error al obtener historial de movimientos', error: err.message });
  }
}

// Reporte simple: availability per branch (list branches with product counts)
export async function getStockReport(req, res) {
  try {
    // Load branches with populated product info
    const branches = await Branch.find().populate({ path: 'stock.product', model: 'Product', select: 'name sku' });

    const report = branches.map(b => ({
      branchId: b._id,
      name: b.name,
      city: b.city,
      totalProducts: b.stock.length,
      products: b.stock.map(s => ({
        productId: s.product?._id || s.product,
        name: s.product?._doc?.name || s.product?.name || null,
        availableQuantity: s.availableQuantity,
        reservedQuantity: s.reservedQuantity || 0
      }))
    }));

    return res.json({ generatedAt: new Date(), report });
  } catch (err) {
    return res.status(500).json({ message: 'Error al generar reporte', error: err.message });
  }
}
