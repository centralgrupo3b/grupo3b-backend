import Type from '../models/Type.js';

export const getTypes = async (req, res) => {
  try {
    const types = await Type.find().sort({ name: 1 });
    res.json(types);
  } catch (err) {
    console.error('getTypes error', err);
    res.status(500).json({ message: 'Error al obtener tipos' });
  }
};

export const createType = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });
    const existing = await Type.findOne({ name });
    if (existing) return res.status(400).json({ message: 'El tipo ya existe' });
    const type = new Type({ name });
    await type.save();
    res.status(201).json(type);
  } catch (err) {
    console.error('createType error', err);
    res.status(500).json({ message: 'Error al crear tipo' });
  }
};

export const deleteType = async (req, res) => {
  try {
    const { id } = req.params;
    await Type.findByIdAndDelete(id);
    res.json({ ok: true, message: 'Tipo eliminado' });
  } catch (err) {
    console.error('deleteType error', err);
    res.status(500).json({ message: 'Error al eliminar tipo' });
  }
};

export const updateType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });
    const type = await Type.findById(id);
    if (!type) return res.status(404).json({ message: 'Tipo no encontrado' });
    const existing = await Type.findOne({ name });
    if (existing && existing._id.toString() !== id) return res.status(400).json({ message: 'Otro tipo con ese nombre ya existe' });
    const oldName = type.name;
    type.name = name;
    await type.save();
    // Propagar cambio a productos que usen la categoría anterior
    const Product = (await import('../models/Product.js')).default;
    await Product.updateMany({ category: oldName }, { $set: { category: name } });
    res.json(type);
  } catch (err) {
    console.error('updateType error', err);
    res.status(500).json({ message: 'Error al actualizar tipo' });
  }
};
