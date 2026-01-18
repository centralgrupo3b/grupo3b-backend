import Brand from '../models/Brand.js';

export const getBrands = async (req, res) => {
  try {
    const brands = await Brand.find().sort({ name: 1 });
    res.json(brands);
  } catch (err) {
    console.error('getBrands error', err);
    res.status(500).json({ message: 'Error al obtener marcas' });
  }
};

export const createBrand = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });
    const existing = await Brand.findOne({ name });
    if (existing) return res.status(400).json({ message: 'La marca ya existe' });
    const brand = new Brand({ name });
    await brand.save();
    res.status(201).json(brand);
  } catch (err) {
    console.error('createBrand error', err);
    res.status(500).json({ message: 'Error al crear marca' });
  }
};

export const deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;
    await Brand.findByIdAndDelete(id);
    res.json({ ok: true, message: 'Marca eliminada' });
  } catch (err) {
    console.error('deleteBrand error', err);
    res.status(500).json({ message: 'Error al eliminar marca' });
  }
};

export const updateBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });
    const brand = await Brand.findById(id);
    if (!brand) return res.status(404).json({ message: 'Marca no encontrada' });
    const existing = await Brand.findOne({ name });
    if (existing && existing._id.toString() !== id) return res.status(400).json({ message: 'Otra marca con ese nombre ya existe' });
    const oldName = brand.name;
    brand.name = name;
    await brand.save();
    // Propagar cambio a productos que usen el nombre anterior
    const Product = (await import('../models/Product.js')).default;
    await Product.updateMany({ brand: oldName }, { $set: { brand: name } });
    res.json(brand);
  } catch (err) {
    console.error('updateBrand error', err);
    res.status(500).json({ message: 'Error al actualizar marca' });
  }
};
