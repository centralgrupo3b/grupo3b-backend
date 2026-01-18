const mongoose = require('mongoose');
const Order = require('./src/models/Order.js');
const Product = require('./src/models/Product.js');

async function migrateBasePriceAtSale() {
  try {
    // Conectar a la base de datos (ajusta la URI si es necesario)
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/grupo3b');
    console.log('Conectado a la base de datos');

    // Buscar todas las órdenes con items que no tengan basePriceAtSale
    const orders = await Order.find({
      'items.basePriceAtSale': { $exists: false }
    }).populate('items.product');

    console.log(`Encontradas ${orders.length} órdenes para migrar`);

    for (const order of orders) {
      for (const item of order.items) {
        if (item.basePriceAtSale === undefined || item.basePriceAtSale === null) {
          // Asumir que item.product.price es el precio base en ARS
          // (ya que la app usa ARS en el carrito)
          if (item.product && typeof item.product.price === 'number') {
            item.basePriceAtSale = item.product.price;
          } else {
            item.basePriceAtSale = 0; // fallback
          }
        }
      }
      await order.save();
      console.log(`Migrada orden ${order._id}`);
    }

    console.log('Migración completada');
    process.exit(0);
  } catch (error) {
    console.error('Error en migración:', error);
    process.exit(1);
  }
}

migrateBasePriceAtSale();