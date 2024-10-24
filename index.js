const express = require("express");
const app = express();
const cors = require("cors");
const multer = require("multer");
const path = require('path');
const util = require('util');
const { error, Console, count } = require("console");
const { send } = require("process");

const db_pool = require('./BD_mysql');

app.use(cors());
app.use(express.json());

app.listen(3000, async () => {
    console.log("Servidor corriendo en el puerto 3000");
});

app.get("/productos/list/:tipo", async (req, res) => {
    const tabla = req.params.tipo;

    try {
        const [result] = await db_pool.query(`select * from producto ${tabla == 'compras' ? 'where padre_id is null' : ''} order by nombre asc`);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/productos/agregar", async (req, res) => {
    const nombre = req.body.nombre;
    const img = req.body.img;
    const pr = req.body.pr;
    const precio = req.body.precio;
    const cantidad = req.body.cantidad;
    const marca = req.body.marca;
    const categoria = req.body.categoria;

    try {
        await db_pool.query("Insert into producto(nombre, img, precio_compra, precio, stock,marca,categoria) values(?,?,?,?,?,?,?)", [nombre, img, pr, precio, cantidad, marca, categoria]);

        res.sendStatus(200);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put("/productos/actualizar", async (req, res) => {
    const id = req.body.id;
    const nombre = req.body.nombre;
    const img = req.body.img;
    const pr = req.body.pr;
    const precio = req.body.precio;
    const cantidad = req.body.cantidad;
    const marca = req.body.marca;
    const categoria = req.body.categoria;

    try {
        await db_pool.query(`update producto set nombre =? ${img.length > 0 ? ",img='" + img + "'" : ''} , precio_compra ='${pr}', precio ='${precio}', stock=${cantidad}, marca=?, categoria=?, updated_at='${dateNow()}' where id=${id};`, [nombre, marca, categoria]);

        res.sendStatus(200);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/categoria_marca/agregar", async (req, res) => {
    const nombre = req.body.nombre;
    const type = req.body.type;

    try {
        const [insert_result] = await db_pool.query(`insert into ${type == 1 ? 'categoria_prod' : 'marca_prod'}(nombre) values('${nombre}')`);

        res.sendStatus(200);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/img/productos');
    },
    filename: function (req, file, cb) {
        const extname = path.extname(file.originalname);
        cb(null, Date.now() + extname);
    }
});

const upload = multer({ storage: storage });

app.post('/img/upload', upload.single('file'), (req, res) => {
    try {
        return res.json({ "data": req.file.filename });
    } catch (err) {
        return res.sendStatus(500);
    }
});

app.get('/img/obtener/:nombre', (req, res) => {
    const name_img = req.params.nombre;
    const rut_img = path.join(__dirname, './public/img/productos', name_img);

    res.sendFile(rut_img, (err) => {
        if (err) {
            console.log(err);
            res.status(404).send('Imagen no encontrada');
        }
    });
});

app.get('/categorias/list', async (req, res) => {
    try {
        const [result] = await db_pool.query("select id,nombre,descripcion from categoria_prod order by nombre");

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/marcas/list', async (req, res) => {
    try {
        const [result] = await db_pool.query("select id,nombre,descripcion from marca_prod order by nombre");

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/Ventas/list', async (req, res) => {
    const fechaNow = dateNow(1);

    const consulta = `
        select max(dv.id) as id,
               max(prod.nombre) product_nombre,
               max(prod.id) as prod_id, 
               sum(dv.cantidad) as cantidad, 
               sum(dv.sub_total) as sub_total
        from producto as prod, venta_detalle as dv
        where dv.created_at like '${fechaNow}%' and
              prod.id = dv.producto_id
        group by dv.producto_id
        order by prod.nombre asc
    `;

    try {
        const [result] = await db_pool.query(consulta);

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/Ventas/producto/:product_id', async (req, res) => {
    const product_id = req.params.product_id;
    const fechaNow = dateNow(1);
    const fechaQuery = req.query.fecha;

    const consulta = `
        select dv.id as id_dv,
               prod.id as id_producto,
               prod.nombre as nombre_producto,
               DATE_FORMAT(dv.created_at, '%H:%i') as hora,
               dv.cantidad,
               dv.sub_total as subTotal
        from producto as prod, venta_detalle as dv, ventas as v
        where v.fecha = '${fechaQuery.length > 7 ? fechaQuery : fechaNow}' and
              dv.venta_id = v.id and
              dv.producto_id = ${product_id} and
              prod.id = dv.producto_id
        order by dv.id
    `;

    try {
        const [result] = await db_pool.query(consulta);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/venta/agregar', async (req, res) => {
    const cantidad = req.body.cantidad;
    const temperatura = req.body.temperatura;
    const producto = req.body.producto;

    let conection_transaction;
    try {
        conection_transaction = await db_pool.getConnection();
        await conection_transaction.beginTransaction();

        let id_venta;

        const [result] = await conection_transaction.query(`SELECT id FROM ventas where fecha = '${dateNow(1)}' LIMIT 1`);

        if (result.length === 0) {
            const [newIDResult] = await conection_transaction.query('INSERT INTO ventas VALUES()');
            id_venta = newIDResult.insertId;
        } else {
            id_venta = result[0].id;
        }

        const [precio_result] = await conection_transaction.query(`SELECT precio,precio_compra FROM producto where id = ${producto} LIMIT 1`);
        let precio;
        if (precio_result.length > 0) {
            precio = precio_result[0].precio;
            precioCompra = precio_result[0].precio_compra;
        }

        const subtotal = parseFloat(precio) * parseInt(cantidad);

        const [newDetalle] = await conection_transaction.query(`INSERT INTO venta_detalle(cantidad,producto_id,precio_venta,sub_total,venta_id,precio_compra) VALUES(${cantidad},${producto},'${precio}','${subtotal}',${id_venta},${precioCompra})`);
        let idDetalle = newDetalle.insertId;

        await conection_transaction.query(`update ventas set total_ventas=total_ventas+${subtotal}, clima= ${temperatura} where id = ${id_venta}`);

        const [product_venta] = (await conection_transaction.query(`select * from producto where id = ${producto} limit 1`))[0];
        let id_product = product_venta.id;
        let stock_product = product_venta.stock;

        const cantidad_exacta = Number(product_venta.cantidad_vender) * Number(cantidad);

        if (Number(product_venta.padre_id) > 0) {
            const [product_padre] = (await conection_transaction.query(`select * from producto where id = ${product_venta.padre_id} limit 1`))[0];

            id_product = product_padre.id;
            stock_product = product_padre.stock;
        }

        if (stock_product >= cantidad_exacta) {
            await conection_transaction.query(`update producto set stock=stock-${cantidad_exacta} where id =${id_product}`);
            res.status(200).json({ 'code': 200, 'message': 'Operación completada' });
        } else {
            await conection_transaction.rollback();

            console.log(`Producto #${Number(product_venta.padre_id) > 0 ? product_venta.padre_id : product_venta.id} no cuenta con la cantidad necesaria para venderlo`);
            res.status(400).json({ 'code': 400, 'message': 'No es posible registrar un producto con STOCK 0, asegurese de tener la cantidad correcta en deposito del producto.' });
            return;
        }
        await conection_transaction.commit();

        console.log("registro de nueva venta exitoso, identificado: " + idDetalle);
    } catch (err) {
        if (conection_transaction) {
            await conection_transaction.rollback();
        }

        console.error("Error al ejecutar la consulta:", err);
        res.sendStatus(500);

        res.status(500).send("Error en la operación...");
    } finally {
        if (conection_transaction) {
            conection_transaction.release();
        }
    }
});

app.get('/venta/obtener/:venta_fecha', async (req, res) => {
    const date_venta = req.params.venta_fecha;

    const consulta = `
        select max(dv.id) as id,
               max(prod.nombre) product_nombre,
               max(prod.id) as prod_id, 
               sum(dv.cantidad) as cantidad, 
               sum(dv.sub_total) as sub_total
        from producto as prod, venta_detalle as dv
        where DATE(dv.created_at) = ${date_venta == 0 ? 'CURDATE()' : (`'` + date_venta + `'`)} and
              prod.id = dv.producto_id
        group by dv.producto_id
        order by prod.nombre asc
    `;

    try {
        const [result] = await db_pool.query(consulta);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/ventas/detalle/eliminar/:dv_id', async (req, res) => {
    const detalle_id = req.params.dv_id;
    console.log("Eliminando el registro detalle venta: " + detalle_id);

    let conection_transaction;
    try {
        conection_transaction = await db_pool.getConnection();

        await conection_transaction.beginTransaction();
        await conection_transaction.query(`
            UPDATE ventas AS v
            JOIN (
                SELECT sub_total, venta_id
                FROM venta_detalle
                WHERE id = ${detalle_id}
            ) cvd ON v.id = cvd.venta_id
            SET v.total_ventas = v.total_ventas - cvd.sub_total;
        `);

        await conection_transaction.query(`
            UPDATE producto as p
            JOIN(
                select vd.producto_id, vd.cantidad
                from venta_detalle as vd
                where vd.id = ${detalle_id}
            ) cvd ON p.id = cvd.producto_id
            SET p.stock = p.stock + cvd.cantidad;
        `);

        await conection_transaction.query(`
            DELETE FROM venta_detalle 
            WHERE id = ${detalle_id}
        `);

        await conection_transaction.commit();

        res.sendStatus(200);
    } catch (error) {
        if (conection_transaction) {
            await conection_transaction.rollback();
        }

        console.error(error);
        res.sendStatus(500);
    } finally {
        if (conection_transaction) {
            conection_transaction.release();
        }
    }
});

//productos mayor vendidos, menor
app.get('/productos/datos/listado/:tipo', async (req, res) => {
    const type_query = req.params.tipo;

    let query_now;

    switch (type_query) {
        case 'top':
            query_now = ` SELECT sum(vd.sub_total) as total, 
                               max(prod.nombre) as prod_nombre 
                        FROM venta_detalle as vd, producto as prod 
                        where prod.id = vd.producto_id 
                        GROUP by vd.producto_id 
                        order by total desc 
                        limit 5`;
            break;
        case 'cantidad':
            query_now = `Select sum(vd.cantidad) as suma_cantidad,
                                max(prod.nombre) as prod_nombre 
                         from venta_detalle as vd, producto as prod 
                         where prod.id = vd.producto_id
                         group by vd.producto_id 
                         order by suma_cantidad desc
                         limit 10`;
            break;
        case 'destacados':
            query_now = `Select sum(vd.sub_total) as total,
                                DATE_FORMAT(MAX(v.fecha), '%Y-%m-%d') AS fechaG 
                         from venta_detalle as vd, ventas as v
                         where v.id = vd.venta_id
                         group by vd.venta_id 
                         order by total desc
                         limit 5`;
            break;
        case 'agotados':
            query_now = `SELECT nombre as prod_nombre, FLOOR(stock / cantidad_vender) result_agotado
                         FROM producto
                         WHERE padre_id is null AND FLOOR(stock / cantidad_vender) <= 4
                         order by result_agotado asc;
            `;
            break;
        case 'pocas_ventas':
            query_now = `SELECT (COUNT(vd.producto_id)*sum(vd.cantidad)) AS veces, MAX(p.nombre) AS prod_nombre
                         FROM venta_detalle AS vd
                         JOIN producto AS p ON p.id = vd.producto_id
                         where p.padre_id is null
                         GROUP BY vd.producto_id
                         HAVING veces < 10
                         ORDER BY veces;
            `;
            break;
        case 'no_ventas':
            query_now = `SELECT p.nombre as prod_nombre
                         FROM producto p
                         where p.id NOT IN (
                             SELECT vd.producto_id
                             FROM venta_detalle AS vd
                         )
                         order by prod_nombre;
            `;
            break;
        default:
            query_now = 'select *from venta_detalle';
            break;
    }

    try {
        const [result] = await db_pool.query(query_now);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/inventario/general/:paramsData', async (req, res) => {
    const paramsData = req.params.paramsData;
    const mes = paramsData.split('-')[1];
    const año = paramsData.split('-')[0];

    try {
        const [query_inventario] = await db_pool.query(`
            select id,estado,descuento,bonificacion,total,DATE_FORMAT(fecha, '%Y-%m-%d') as fecha 
            from inventario 
            where MONTH(fecha) = '${mes}' and YEAR(fecha)='${año}' order by fecha`);

        const ids_Inventario = query_inventario.map(result_Inventario => result_Inventario.id);

        const [query_detail] = await db_pool.query(`
            select id.inventario_id as inventario_id,
                    id.id as detalleInventario_id,
                    id.precio_Unidad, 
                    id.precio_Paquete, 
                    p.nombre as producto_nombre,
                    id.cantidad_Paquete,
                    id.cantidad_Unidad
            from inventario_detalle as id, producto as p 
            where id.inventario_id in (${ids_Inventario}) and p.id = id.producto_id`);

        const [result1, result2] = await Promise.all([query_inventario, query_detail]);

        const json_data = result1.map((datos) => ({ ...datos, detalle: result2.filter(datos2 => datos2.inventario_id == datos.id) }));

        res.json(json_data);
    } catch (error) {
        console.log(error);
    }
});

app.get('/inventario/producto/:producto_id', async (req, res) => {
    const producto_id = req.params.producto_id;

    const consulta = `
        select DATE_FORMAT(id.created_at, '%Y-%m-%d %H:%i') AS created_at,
               id.tipo_Inventario,
               id.cantidad_Unidad,
               id.cantidad_Paquete,
               id.precio_Paquete,
               id.precio_Unidad 
        from inventario_detalle as id
        where id.producto_id = ${producto_id}
        order by id.created_at desc
        Limit 10
    `;
    try {
        const [result] = await db_pool.query(consulta);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/inventario/registrar', async (req, res) => {
    const objCompra = req.body;
    const total = objCompra.reduce((acumulador, objC) => acumulador + parseFloat(objC.subtotal), 0);

    let conection_transaction;
    try {
        conection_transaction = await db_pool.getConnection();

        await conection_transaction.beginTransaction();

        const [query_current_purchase] = await db_pool.query(`SELECT id FROM inventario where fecha = '${dateNow(1)}' LIMIT 1`);
        var id_compra;

        if (query_current_purchase.length === 0) {
            const [newIDResult] = await db_pool.query(`INSERT INTO inventario(total) VALUES('${total}')`);
            id_compra = newIDResult.insertId;
        } else {
            id_compra = query_current_purchase[0].id;
            await db_pool.query('update inventario set total = total + ? where id = ?', [total, id_compra]);
        }

        for (const arrayC of objCompra) {
            await db_pool.query(
                'INSERT INTO inventario_detalle(tipo_Inventario, inventario_id, producto_id, precio_Paquete, precio_Unidad, cantidad_Unidad, cantidad_Paquete) VALUES(?,?,?,?,?,?,?)',
                [arrayC.tipo, id_compra, arrayC.producto_id, parseFloat(arrayC.precioPaquete).toFixed(2), parseFloat(arrayC.precioUnidad).toFixed(2), arrayC.cantidadUnidad, arrayC.cantidadPaquete]
            );

            const [producto_update] = (await db_pool.query(`select cantidad_vender from producto where id = ${arrayC.producto_id}`))[0];
            let idProducto = Number(producto_update.padre_id) > 0 ? producto_update.padre_id : arrayC.producto_id;
            const unidadTotal = (parseInt(arrayC.cantidadUnidad) * (arrayC.cantidadPaquete == 0 ? 1 : parseInt(arrayC.cantidadPaquete)))*producto_update.cantidad_vender;

            await db_pool.query(`update producto set stock = stock + ${unidadTotal}, precio_compra = '${parseFloat(arrayC.precioUnidad)}' where id = ${arrayC.producto_id}`);
        }
        await conection_transaction.commit();

        res.sendStatus(200);
    } catch (error) {
        if (conection_transaction) {
            await conection_transaction.rollback();
        }

        console.error(error);
        res.sendStatus(500);
    } finally {
        if (conection_transaction) {
            conection_transaction.release();
        }
    }
});

app.get('/consultas/avanzadas', async (req, res) => {
    const queryParams = req.query;
    console.log(queryParams);

    res.json(queryParams);
});

app.get('/:type/detalle/unico', async (req, res) => {
    const tabla = req.params.type == 'ventas' ? 'venta_detalle' : 'inventario_detalle';
    const producto_id = req.query.producto_id;

    const consulta = `
        ${tabla == 'venta_detalle' ? `
            SELECT DATE_FORMAT(cc.created_at, '%d-%m-%Y %H:%i') as fecha_hora,
            cc.cantidad,
            cc.precio_venta,
            cc.sub_total
        `: `
            SELECT DATE_FORMAT(cc.created_at, '%d-%m-%Y %H:%i') as fecha_hora,
            IF(cc.precio_Paquete>0,concat('Paquete(',cc.cantidad_Paquete,')</br> Unidad(',cc.cantidad_Unidad,')'),concat('Unidad(',cc.cantidad_Unidad,')')) as cantidad,
            IF(cc.precio_Paquete>0,cc.precio_Paquete,cc.precio_Unidad) as precio_venta,
            IF(cc.precio_Paquete>0,(cc.precio_Paquete*cc.cantidad_Paquete),(cc.precio_Unidad*cc.cantidad_Unidad)) as sub_total
        `}FROM ${tabla} as cc
        WHERE cc.producto_id = ${producto_id}
        ORDER BY cc.created_at desc;
    `;
    console.log(consulta);
    try {
        const [pool_result] = await db_pool.query(consulta);

        res.json(pool_result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function dateNow(tipo = 0) {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Los meses comienzan desde 0
    const day = String(date.getDate()).padStart(2, '0');

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    const tiempo = tipo == 0 ? ` ${hours}:${minutes}:${seconds}` : '';

    return `${year}-${month}-${day}${tiempo}`;
}


/*
  "homepage": "http://tienda-salinas.com",
    "start": "react-scripts start --host tienda-salinas.com",

*/