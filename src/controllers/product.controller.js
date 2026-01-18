import Product from "../models/Product.js";
import Branch from "../models/Branch.js";
import Order from "../models/Order.js";
import mongoose from 'mongoose';
import fs from 'fs';
import sharp from 'sharp';
import cloudinary from '../config/cloudinary.js';

// Crear producto - SOLO ADMIN CENTRAL
export async function createProduct(req, res) {
  try {
    // Validar que sea admin_central
    if (req.user.role !== 'admin_central') {
      return res.status(403).json({ message: "Solo admin central puede crear productos" });
    }

    const data = { ...req.body };

    // Handle file upload: convert to WebP and upload to Cloudinary (process in-memory)
    if (req.file) {
      try {
        const webpBuffer = await sharp(req.file.buffer).webp({ quality: 80 }).toBuffer();

        const publicId = `${process.env.CLOUDINARY_FOLDER || 'grupo3b/products'}/${Date.now()}-${Math.round(Math.random()*1e9)}`;
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({ public_id: publicId, resource_type: 'image' }, (err, result) => err ? reject(err) : resolve(result));
          stream.end(webpBuffer);
        });

        data.image = uploadResult.secure_url;
        data.imagePublicId = uploadResult.public_id;
      } catch (err) {
        console.warn('Error uploading to Cloudinary, image not saved:', err.message || err);
        data.image = undefined;
      }
    }

    if (data.price) data.price = Number(data.price);
    if (data.centralQuantity) data.centralQuantity = Number(data.centralQuantity);

    const product = await Product.create(data);
    return res.json({ message: "Producto creado", product });
  } catch (err) {
    return res.status(500).json({ message: "Error al crear producto", error: err.message });
  }
}

// Obtener todos los productos del catálogo
export async function getProducts(req, res) {
  try {
    const branchId = req.query.branchId;

    // Load all products first
    let products = await Product.find().populate('branchPrices.branchId', 'name').populate('brand', 'name').lean();

    // If branchId provided, compute branchAvailable and apply branch-specific price
    if (branchId) {
      const branch = await Branch.findById(branchId);
      const stockMap = new Map();
      if (branch && Array.isArray(branch.stock)) {
        branch.stock.forEach(s => {
          const pid = s.productId?._id ? s.productId._id.toString() : (s.productId || s.product);
          stockMap.set(pid?.toString(), s.quantity ?? s.availableQuantity ?? 0);
        });
      }

      products = products.map(p => {
        const pid = p._id ? p._id.toString() : p.id;
        const branchQty = stockMap.has(pid) ? stockMap.get(pid) : 0;
        const branchPriceEntry = (p.branchPrices || []).find(bp => {
          const bid = bp.branchId?._id?.toString ? bp.branchId._id.toString() : (bp.branchId?.toString ? bp.branchId.toString() : undefined);
          return bid === branchId;
        });
        
        const result = {
          ...p,
          image: p.image || (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null),
          branchAvailable: branchQty,
          basePrice: p.price, // Precio base USD original
          price: branchPriceEntry ? branchPriceEntry.price : p.price, // Precio de venta de sucursal (o base si no hay)
          markup: branchPriceEntry?.markup
        };
        
        return result;
      });
    } else {
      products = products.map(p => ({
        ...p,
        image: p.image || (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null)
      }));
    }

    return res.json(products);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener productos", error: err.message });
  }
}

// Obtener productos más vendidos en un rango de tiempo (opcionalmente filtrado por sucursal)
export async function getMostSoldProducts(req, res) {
  try {
    const days = Number(req.query.days) || 30;
    const branchId = req.query.branchId;
    const limit = Number(req.query.limit) || 50;

     console.log('MOST SOLD – branchId raw:', branchId);
    console.log('MOST SOLD – branchId type:', typeof branchId);

    // If branch admin requests a branchId, ensure it's their own branch
    if (branchId && req.user && req.user.role === 'admin_sucursal') {
      const userBranchId = req.user.branchId?._id?.toString ? req.user.branchId._id.toString() : (req.user.branchId?.toString ? req.user.branchId.toString() : undefined);
      if (userBranchId !== branchId) {
        return res.status(403).json({ message: "No autorizado para consultar ventas de otra sucursal" });
      }
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const match = { createdAt: { $gte: since }, status: "approved" };
    if (branchId) {
      try {
        match.branch = String(branchId);
      } catch (e) {
        // fallback to string (should not usually happen)
        match.branch = branchId;
      }
    }


    console.log('getMostSoldProducts match:', match);
    const sampleOrders = await Order.find(match).limit(5).lean();
    console.log('getMostSoldProducts sampleOrders count:', sampleOrders.length);
    if (sampleOrders.length > 0) {
      console.log('Sample order[0] items:', JSON.stringify(sampleOrders[0].items, null, 2));
    }

    const aggregateMatch = {
      createdAt: { $gte: since },
      status: "approved"
    };

    if (branchId) {
      aggregateMatch.branch = new mongoose.Types.ObjectId(branchId);
    }


    // Agrupar robustamente: soportar tanto items.product (ObjectId) como items.product._id (cuando está poblado)
    const aggGroups = await Order.aggregate([
      { $match: aggregateMatch },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          totalSold: { $sum: "$items.quantity" }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: limit }
    ]);


    console.log('getMostSoldProducts aggGroups raw:', JSON.stringify(aggGroups, null, 2));

    if (!Array.isArray(aggGroups) || aggGroups.length === 0) {
      console.log('getMostSoldProducts agg length: 0 (no groups)');
      return res.json([]);
    }

    // Obtener los productos correspondientes y mapear resultados preservando el orden
    const productIds = aggGroups.map(g => g._id);
    console.log('getMostSoldProducts productIds:', productIds);

    // Mongoose manejará cast si son strings
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const prodMap = new Map(products.map(p => [String(p._id), p]));

    const results = aggGroups.map(g => {
      const pidStr = String(g._id);
      const prod = prodMap.get(pidStr);
      if (!prod) return null; // omitimos si no existe el producto
      return {
        productId: g._id,
        totalSold: g.totalSold,
        name: prod.name,
        sku: prod.sku,
        brand: prod.brand
      };
    }).filter(Boolean);

    console.log('getMostSoldProducts final results length:', results.length);
    return res.json(results);
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener productos más vendidos", error: err.message });
  }
} 

// Obtener productos de una sucursal específica (con sus stocks)
export async function getProductsByBranch(req, res) {
  try {
    const { branchId } = req.params;
    
    const branch = await Branch.findById(branchId).populate('stock.productId');
    if (!branch) {
      return res.status(404).json({ message: "Sucursal no encontrada" });
    }

    // Normalizar distintos esquemas de stock: algunas entradas antiguas usan 'product' y 'availableQuantity'
    const productsWithStock = await Promise.all(branch.stock.map(async (s) => {
      // Obtener el objeto de producto: puede estar en s.productId (poblado), s.productId (id), o s.product
      let prod = s.productId || s.product;

      if (!prod) return null;

      // Si prod es solo un id (string/ObjectId), cargar producto desde DB
      if (typeof prod === 'string' || prod._id === undefined) {
        try {
          prod = await Product.findById(prod).lean();
        } catch (e) {
          prod = null;
        }
      }

      if (!prod) return null;

      const branchPrice = (prod.branchPrices || []).find(bp => {
        const bid = bp.branchId?._id?.toString ? bp.branchId._id.toString() : (bp.branchId?.toString ? bp.branchId.toString() : undefined);
        return bid === branchId;
      });
      const branchQuantity = s.quantity ?? s.availableQuantity ?? 0;
      const reservedQuantity = s.reservedQuantity ?? s.reservedQuantity ?? 0;

      return {
        _id: prod._id,
        name: prod.name,
        sku: prod.sku,
        brand: prod.brand,
        description: prod.description,
        image: prod.image || (Array.isArray(prod.images) && prod.images.length > 0 ? prod.images[0] : null),
        basePrice: prod.price,
        price: branchPrice?.price || prod.price,
        markup: branchPrice?.markup,
        centralQuantity: prod.centralQuantity,
        branchQuantity,
        reservedQuantity
      };
    }));

    // Filtrar nulos
    return res.json(productsWithStock.filter(Boolean));
  } catch (err) {
    return res.status(500).json({ message: "Error al obtener productos", error: err.message });
  }
}

// Actualizar stock central - SOLO ADMIN CENTRAL
export async function updateCentralStock(req, res) {
  try {
    if (req.user.role !== 'admin_central') {
      return res.status(403).json({ message: "Solo admin central puede actualizar stock central" });
    }

    const { productId } = req.params;
    const { quantity } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    // Sumar la cantidad en lugar de reemplazarla
    product.centralQuantity = (product.centralQuantity || 0) + Number(quantity);
    await product.save();

    return res.json({ message: "Stock central actualizado.", product });
  } catch (err) {
    return res.status(500).json({ message: "Error al actualizar stock", error: err.message });
  }
}

// Editar producto - SOLO ADMIN CENTRAL (catálogo general)
export async function updateProduct(req, res) {
  try {
    if (req.user.role !== 'admin_central') {
      return res.status(403).json({ message: "Solo admin central puede editar productos" });
    }

    const { productId } = req.params;
    const data = { ...req.body };
    if (data.price) data.price = Number(data.price);
    if (data.centralQuantity) data.centralQuantity = Number(data.centralQuantity);

    // Handle image if provided: convert to WebP and upload to Cloudinary (process in-memory)
    if (req.file) {
      // load existing product to possibly remove old image
      const existing = await Product.findById(productId);
      try {
        const webpBuffer = await sharp(req.file.buffer).webp({ quality: 80 }).toBuffer();
        const publicId = `${process.env.CLOUDINARY_FOLDER || 'grupo3b/products'}/${Date.now()}-${Math.round(Math.random()*1e9)}`;
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({ public_id: publicId, resource_type: 'image' }, (err, result) => err ? reject(err) : resolve(result));
          stream.end(webpBuffer);
        });

        data.image = uploadResult.secure_url;
        data.imagePublicId = uploadResult.public_id;

        // Remove old image from Cloudinary if present
        if (existing && existing.imagePublicId && existing.imagePublicId !== uploadResult.public_id) {
          cloudinary.uploader.destroy(existing.imagePublicId).catch(()=>{});
        }
      } catch (err) {
        console.warn('Error uploading to Cloudinary, image not saved:', err.message || err);
        data.image = undefined;
      }
    }

    const product = await Product.findByIdAndUpdate(productId, data, { new: true });
    return res.json({ message: 'Producto actualizado', product });
  } catch (err) {
    return res.status(500).json({ message: 'Error al actualizar producto', error: err.message });
  }
}

// Actualizar precio de producto en una sucursal - SOLO ADMIN SUCURSAL PARA SU SUCURSAL
export async function updateBranchProductPrice(req, res) {
  try {
    if (req.user.role !== 'admin_sucursal') {
      return res.status(403).json({ message: "Solo admin sucursal puede modificar precios" });
    }

    const { productId, branchId } = req.params;
    const { price } = req.body;

    // Verificar que el admin es de esa sucursal
    // req.user.branchId puede ser un objeto (si está populated) o un string (si es un id directo)
    const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString();
    const paramBranchId = branchId?.toString();
    
    console.log('🔍 DEBUG updateBranchProductPrice:');
    console.log('  - req.user.branchId:', req.user.branchId);
    console.log('  - userBranchId (convertido):', userBranchId);
    console.log('  - paramBranchId:', paramBranchId);
    console.log('  - ¿Son iguales?', userBranchId === paramBranchId);
    
    if (userBranchId !== paramBranchId) {
      console.log('❌ Acceso denegado: branchId no coincide');
      return res.status(403).json({ message: "No tienes permisos en esta sucursal" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    // Buscar o crear entrada de precio para esta sucursal
    let branchPrice = product.branchPrices.find(bp => bp.branchId?.toString() === branchId);
    const incomingMarkup = (typeof req.body.markup !== 'undefined') ? Number(req.body.markup) : undefined;

    if (branchPrice) {
      // Si mandan price, actualizarlo
      if (typeof price !== 'undefined') branchPrice.price = Number(price);
      // Si mandan markup, actualizarlo; si no, conservar el existente
      if (typeof incomingMarkup !== 'undefined' && !isNaN(incomingMarkup)) branchPrice.markup = incomingMarkup;
    } else {
      product.branchPrices.push({
        branchId,
        price: Number(price),
        markup: (typeof incomingMarkup !== 'undefined' && !isNaN(incomingMarkup)) ? incomingMarkup : undefined
      });
    }

    await product.save();
    return res.json({ message: 'Precio actualizado', product });
  } catch (err) {
    return res.status(500).json({ message: 'Error al actualizar precio', error: err.message });
  }
}

// Recalcular/Actualizar precios para TODA una sucursal basados en una nueva tasa de cambio
export async function recalculateBranchPrices(req, res) {
  try {
    if (req.user.role !== 'admin_sucursal') {
      return res.status(403).json({ message: "Solo admin sucursal puede recalcular precios de su sucursal" });
    }

    const { branchId } = req.params;
    const { rate, force } = req.body;
    const finalRate = Number(rate);
    const forceApply = !!force;

    if (!finalRate || isNaN(finalRate) || finalRate <= 0) {
      return res.status(400).json({ message: "Rate inválida" });
    }

    // Verificar que el admin es de esa sucursal
    const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString();
    if (userBranchId !== (branchId?.toString())) {
      return res.status(403).json({ message: "No tienes permisos en esta sucursal" });
    }

    const products = await Product.find().lean();
    let updatedCount = 0;
    const updates = [];

    for (const p of products) {
      const basePriceDollar = (p.basePrice ?? p.price ?? 0);
      if (!basePriceDollar || basePriceDollar <= 0) continue;

      const bpIndex = Array.isArray(p.branchPrices) ? p.branchPrices.findIndex(bp => bp.branchId?.toString ? bp.branchId.toString() === branchId : false) : -1;
      let bp = null;
      let computedPrice = null;
      if (bpIndex >= 0) {
        bp = p.branchPrices[bpIndex];
        const markup = (bp && typeof bp.markup === 'number') ? bp.markup : 0;
        computedPrice = basePriceDollar * finalRate * (1 + (markup / 100));
        // Apply only if markup is present (managed) OR forceApply is true
        if (typeof bp.markup === 'number' || forceApply) {
          updates.push({
            updateOne: {
              filter: { _id: p._id, "branchPrices.branchId": new mongoose.Types.ObjectId(branchId) },
              update: { $set: { "branchPrices.$.price": Number(computedPrice.toFixed(2)), "branchPrices.$.markup": (typeof bp.markup === 'number' ? bp.markup : 0) } }
            }
          });
          updatedCount++;
        }
      } else if (forceApply) {
        // create new bp entry (use ObjectId for consistency)
        const markup = 0;
        computedPrice = basePriceDollar * finalRate * (1 + (markup / 100));
        updates.push({
          updateOne: {
            filter: { _id: p._id },
            update: { $push: { branchPrices: { branchId: new mongoose.Types.ObjectId(branchId), price: Number(computedPrice.toFixed(2)), markup } } }
          }
        });
        updatedCount++;
      }
    }

    if (updates.length > 0) {
      // BulkWrite with upsert disabled
      const writeResult = await Product.bulkWrite(updates);
      // Prefer modern fields if available
      updatedCount = writeResult.modifiedCount ?? writeResult.nModified ?? updatedCount;
      console.log('🔁 bulkWrite result:', { insertedCount: writeResult.insertedCount, matchedCount: writeResult.matchedCount, modifiedCount: writeResult.modifiedCount ?? writeResult.nModified });
    }

    return res.json({ message: 'Precios recalculados', updatedCount, rate: finalRate });
  } catch (err) {
    return res.status(500).json({ message: 'Error al recalcular precios', error: err.message });
  }
}

// Eliminar producto - SOLO ADMIN CENTRAL
export async function deleteProduct(req, res) {
  try {
    if (req.user.role !== 'admin_central') {
      return res.status(403).json({ message: "Solo admin central puede eliminar productos" });
    }

    const { productId } = req.params;
    const product = await Product.findByIdAndDelete(productId);
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    return res.json({ message: 'Producto eliminado', product });
  } catch (err) {
    return res.status(500).json({ message: 'Error al eliminar producto', error: err.message });
  }
}

// Eliminar precio específico de sucursal (restaurar a precio base)
export async function deleteBranchProductPrice(req, res) {
  try {
    if (req.user.role !== 'admin_sucursal') {
      return res.status(403).json({ message: "Solo admin sucursal puede modificar precios" });
    }

    const { productId, branchId } = req.params;

    // req.user.branchId puede ser objeto o id
    const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString();
    const paramBranchId = branchId?.toString();

    if (userBranchId !== paramBranchId) {
      return res.status(403).json({ message: "No tienes permisos en esta sucursal" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    // Filtrar branchPrices removiendo la entrada de esta sucursal
    if (Array.isArray(product.branchPrices)) {
      product.branchPrices = product.branchPrices.filter(bp => bp.branchId?.toString() !== branchId);
    }

    await product.save();
    return res.json({ message: 'Precio restaurado al base', product });
  } catch (err) {
    return res.status(500).json({ message: 'Error al restaurar precio', error: err.message });
  }
}