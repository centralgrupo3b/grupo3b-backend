import Branch from "../models/Branch.js";
import Product from "../models/Product.js";
import StockMovement from "../models/StockMovement.js";

// Crear sucursal
export async function createBranch(req, res) {
  try {
    const branch = await Branch.create(req.body);
    return res.json({ message: "Sucursal creada", branch });
  } catch (err) {
    return res.status(500).json({ message: "Error al crear sucursal", error: err.message });
  }
}

// Obtener todas las sucursales
export async function getBranches(req, res) {
  try {
    const branches = await Branch.find();
    return res.json(branches);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener sucursales" });
  }
}

// Obtener información de una sucursal (incluye stock poblado)
export async function getBranchById(req, res) {
  try {
    const { id } = req.params;
    const branch = await Branch.findById(id).populate({
      path: 'stock.productId',
      model: 'Product',
      select: 'name sku price centralQuantity image branchPrices'
    });
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    return res.json(branch);
  } catch (err) {
    return res.status(500).json({ message: 'Error al obtener la sucursal', error: err.message });
  }
}

// Actualizar sucursal
export async function updateBranch(req, res) {
  try {
    const { id } = req.params;
    const { name, number, address, city, defaultMarkup } = req.body;
    
    const branch = await Branch.findByIdAndUpdate(
      id,
      { name, number, address, city, defaultMarkup },
      { new: true, runValidators: true }
    );
    
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    return res.json({ message: 'Sucursal actualizada', branch });
  } catch (err) {
    return res.status(500).json({ message: 'Error al actualizar sucursal', error: err.message });
  }
}

// Eliminar sucursal
export async function deleteBranch(req, res) {
  try {
    const { id } = req.params;
    const branch = await Branch.findByIdAndDelete(id);
    
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    return res.json({ message: 'Sucursal eliminada', branch });
  } catch (err) {
    return res.status(500).json({ message: 'Error al eliminar sucursal', error: err.message });
  }
}

// Transferir stock desde el centro
export async function transferStock(req, res) {
  try {
    const { branchId, productId, quantity } = req.body;

    const product = await Product.findById(productId);
    const branch = await Branch.findById(branchId);

    if (!product || !branch) return res.status(400).json({ message: "Sucursal o producto no encontrados" });

    // Verificar stock central disponible
    if (product.centralQuantity < quantity) {
      return res.status(400).json({ message: "Stock central insuficiente" });
    }

    // Descontar stock central
    product.centralQuantity -= quantity;
    await product.save();

    // Buscar si la sucursal ya tiene ese producto registrado
    const stockItem = branch.stock.find(s => {
      const sid = s.productId?._id ? s.productId._id.toString() : (s.productId || s.product);
      return sid?.toString() === productId;
    });

    if (stockItem) {
      stockItem.availableQuantity += quantity;
    } else {
      branch.stock.push({ productId: productId, availableQuantity: quantity });
    }

    await branch.save();

    // Log stock movement (if request has user)
    try {
      const movement = await StockMovement.create({
        user: req.user ? req.user._id : undefined,
        product: productId,
        from: 'central',
        toBranch: branchId,
        quantity,
        notes: req.body.notes || ''
      });
      // optional: attach movement id to response
      return res.json({ message: "Stock transferido correctamente", branch, movement });
    } catch (logErr) {
      // If logging fails, still return success but note issue
      return res.json({ message: "Stock transferido correctamente (error al registrar movimiento)", branch, logError: logErr.message });
    }
  } catch (err) {
    return res.status(500).json({ message: "Error en transferencia", error: err.message });
  }
}

// Actualizar stock manualmente en sucursal (solo para admin_sucursal)
export async function updateBranchStockManual(req, res) {
  try {
    const { branchId, products } = req.body;

    // Validar que products sea un array
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "Debe proporcionar al menos un producto" });
    }

    const branch = await Branch.findById(branchId);
    if (!branch) return res.status(400).json({ message: "Sucursal no encontrada" });

    const movements = [];
    const errors = [];

    // Procesar cada producto
    for (const productData of products) {
      const { productId, quantity } = productData;

      if (!productId || !quantity || quantity <= 0) {
        errors.push(`Producto ${productId}: cantidad inválida`);
        continue;
      }

      const product = await Product.findById(productId);
      if (!product) {
        errors.push(`Producto ${productId}: no encontrado`);
        continue;
      }

      // Buscar si la sucursal ya tiene ese producto registrado
      const stockItem = branch.stock.find(s => {
        const sid = s.productId?._id ? s.productId._id.toString() : (s.productId || s.product);
        return sid?.toString() === productId;
      });

      if (stockItem) {
        // Asegurarse de que availableQuantity existe
        if (stockItem.availableQuantity !== undefined) {
          stockItem.availableQuantity += quantity;
        } else if (stockItem.quantity !== undefined) {
          stockItem.quantity += quantity;
        } else {
          // Si no existe ninguno, crear availableQuantity
          stockItem.availableQuantity = quantity;
        }
      } else {
        branch.stock.push({ productId: productId, availableQuantity: quantity });
      }

      // Log stock movement
      try {
        const movement = await StockMovement.create({
          user: req.user ? req.user._id : undefined,
          product: productId,
          from: 'manual',
          toBranch: branchId,
          quantity,
          notes: req.body.notes || 'Carga manual de stock'
        });
        movements.push(movement);
      } catch (logErr) {
        console.error('Error al registrar movimiento:', logErr.message);
      }
    }

    await branch.save();

    if (errors.length > 0) {
      return res.status(207).json({
        message: "Stock actualizado parcialmente",
        branch,
        movements,
        errors,
        successCount: products.length - errors.length
      });
    }

    return res.json({ message: "Stock actualizado manualmente", branch, movements });
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar stock manualmente", error: err.message });
  }
}

// Actualizar tasa de conversión de una sucursal
export async function updateBranchExchangeRate(req, res) {
  try {
    const { id } = req.params;
    const { exchangeRate } = req.body;

    const branch = await Branch.findByIdAndUpdate(
      id,
      { exchangeRate: Number(exchangeRate) },
      { new: true }
    );

    if (!branch) return res.status(404).json({ message: "Sucursal no encontrada" });

    return res.json({ message: "Tasa de conversión actualizada", branch });
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar tasa de conversión", error: err.message });
  }
}

// Actualizar precios de productos para una sucursal
export async function updateBranchProductPrices(req, res) {
  try {
    const { id } = req.params;
    const { productPrices } = req.body; // Array de { productId, profitMargin, finalPrice }

    const branch = await Branch.findByIdAndUpdate(
      id,
      { productPrices },
      { new: true }
    ).populate('productPrices.productId', 'name');

    if (!branch) return res.status(404).json({ message: "Sucursal no encontrada" });

    return res.json({ message: "Precios de productos actualizados", branch });
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar precios", error: err.message });
  }
}

// Obtener precios de productos para una sucursal
export async function getBranchProductPrices(req, res) {
  try {
    const { id } = req.params;
    const branch = await Branch.findById(id).populate('productPrices.productId', 'name sku');

    if (!branch) return res.status(404).json({ message: "Sucursal no encontrada" });

    return res.json({ productPrices: branch.productPrices, exchangeRate: branch.exchangeRate });
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener precios", error: err.message });
  }
}

