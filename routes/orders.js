const express = require("express");
const db = require("../config/database");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// ============================================
// CREATE ORDER - Tạo đơn hàng mới
// ============================================
router.post("/orders", authMiddleware, async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { name, phone, address, note, items, total } = req.body;
    const userId = req.userId;

    // Validate
    if (!name || !phone || !address || !items || items.length === 0) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Thông tin đơn hàng không hợp lệ" });
    }

    // Insert order
    const [orderResult] = await connection.query(
      `INSERT INTO orders 
       (user_id, customer_name, phone, address, note, total_amount, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, phone, address, note || "", total, "pending"]
    );

    const orderId = orderResult.insertId;

    // Insert order items
    for (const item of items) {
      await connection.query(
        `INSERT INTO order_items 
         (order_id, product_id, product_name, price, quantity) 
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.productId, item.name, item.price, item.quantity]
      );
    }

    await connection.commit();

    res.status(201).json({
      message: "Đặt hàng thành công",
      orderId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create order error:", error);
    res.status(500).json({ message: "Lỗi server. Vui lòng thử lại sau." });
  } finally {
    connection.release();
  }
});

// ============================================
// GET USER ORDERS - Lấy danh sách đơn hàng
// ============================================
router.get("/orders", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    // Get orders with items
    const [orders] = await db.query(
      `SELECT 
        o.id,
        o.customer_name,
        o.phone,
        o.address,
        o.note,
        o.total_amount,
        o.status,
        o.created_at,
        GROUP_CONCAT(
          JSON_OBJECT(
            'name', oi.product_name,
            'price', oi.price,
            'quantity', oi.quantity
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC`,
      [userId]
    );

    // Parse items JSON
    const ordersWithItems = orders.map((order) => ({
      ...order,
      items: order.items ? JSON.parse(`[${order.items}]`) : [],
    }));

    res.json({
      message: "Lấy danh sách đơn hàng thành công",
      orders: ordersWithItems,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ message: "Lỗi server. Vui lòng thử lại sau." });
  }
});

// ============================================
// GET ORDER BY ID - Lấy chi tiết đơn hàng
// ============================================
router.get("/orders/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const orderId = req.params.id;

    // Get order
    const [orders] = await db.query(
      "SELECT * FROM orders WHERE id = ? AND user_id = ?",
      [orderId, userId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    // Get order items
    const [items] = await db.query(
      "SELECT * FROM order_items WHERE order_id = ?",
      [orderId]
    );

    res.json({
      message: "Lấy chi tiết đơn hàng thành công",
      order: {
        ...orders[0],
        items,
      },
    });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ message: "Lỗi server. Vui lòng thử lại sau." });
  }
});

module.exports = router;
