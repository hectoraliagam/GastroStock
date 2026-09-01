import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mysql.connector

app = FastAPI()

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "hectoraliagam"),
        password=os.getenv("DB_PASSWORD", "1234"),
        database=os.getenv("DB_NAME", "restaurante_pro_db"),
        port=os.getenv("DB_PORT", 3306)
    )

class LoginData(BaseModel):
    username: str
    password: str

class Movimiento(BaseModel):
    id_inventario: int
    tipo: str
    cantidad: float
    motivo: str
    usuario: str

class ItemInventario(BaseModel):
    ingrediente: str
    unidad: str
    stock_minimo: float
    costo_unitario: float

@app.post("/api/login")
def login(data: LoginData):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT id, id_restaurante, username, rol FROM usuarios WHERE username = %s AND password = %s", 
        (data.username, data.password)
    )
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return {"status": "success", "user": user}

@app.get("/api/inventario/{id_restaurante}")
def obtener_inventario(id_restaurante: int):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM inventario WHERE id_restaurante = %s ORDER BY ingrediente ASC", (id_restaurante,))
    items = cursor.fetchall()
    cursor.close()
    conn.close()
    for item in items:
        item["alerta_compra"] = float(item["cantidad_actual"]) <= float(item["stock_minimo"]) # type: ignore
    return {"status": "success", "data": items}

# NUEVO: Endpoint para CREAR un insumo nuevo
@app.post("/api/inventario/{id_restaurante}")
def crear_insumo(id_restaurante: int, item: ItemInventario):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        sql = "INSERT INTO inventario (id_restaurante, ingrediente, unidad, stock_minimo, costo_unitario) VALUES (%s, %s, %s, %s, %s)"
        cursor.execute(sql, (id_restaurante, item.ingrediente, item.unidad, item.stock_minimo, item.costo_unitario))
        conn.commit()
        return {"status": "success", "message": "Insumo agregado exitosamente"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

# NUEVO: Endpoint para ELIMINAR un insumo
@app.delete("/api/inventario/{id_restaurante}/{id_insumo}")
def eliminar_insumo(id_restaurante: int, id_insumo: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM inventario WHERE id = %s AND id_restaurante = %s", (id_insumo, id_restaurante))
        conn.commit()
        return {"status": "success", "message": "Insumo eliminado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar.")
    finally:
        cursor.close()
        conn.close()

@app.post("/api/movimientos")
def registrar_movimiento(mov: Movimiento):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conn.start_transaction()
        sql_mov = "INSERT INTO movimientos (id_inventario, tipo, cantidad, motivo, usuario) VALUES (%s, %s, %s, %s, %s)"
        cursor.execute(sql_mov, (mov.id_inventario, mov.tipo, mov.cantidad, mov.motivo, mov.usuario))
        operador = "+" if mov.tipo == 'entrada' else "-"
        sql_inv = f"UPDATE inventario SET cantidad_actual = cantidad_actual {operador} %s WHERE id = %s"
        cursor.execute(sql_inv, (mov.cantidad, mov.id_inventario))
        conn.commit()
        return {"status": "success", "message": "Movimiento registrado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/api/reportes/valorizacion/{id_restaurante}")
def reporte_valorizacion(id_restaurante: int):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT ingrediente, cantidad_actual, costo_unitario, (cantidad_actual * costo_unitario) as capital_invertido 
        FROM inventario WHERE cantidad_actual > 0 AND id_restaurante = %s
    """, (id_restaurante,))
    items = cursor.fetchall()
    total_capital = sum(item['capital_invertido'] for item in items) # type: ignore
    cursor.close()
    conn.close()
    return {"capital_total_almacen": round(total_capital, 2), "detalle": items}

@app.get("/api/alertas/compras/{id_restaurante}")
def generar_lista_compras_whatsapp(id_restaurante: int):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT i.ingrediente, i.cantidad_actual, i.stock_minimo, i.unidad, p.nombre as proveedor, p.telefono
        FROM inventario i
        LEFT JOIN proveedores p ON i.id_proveedor = p.id
        WHERE i.cantidad_actual <= i.stock_minimo AND i.id_restaurante = %s
    """, (id_restaurante,))
    faltantes = cursor.fetchall()
    cursor.close()
    conn.close()
    if not faltantes:
        return {"mensaje_generado": "Todo en orden. No hay compras urgentes hoy."}
    mensaje_wa = "*⚠️ ALERTA DE COMPRAS - CIERRE DE TURNO* \n\n"
    for item in faltantes:
        comprar = item['stock_minimo'] - item['cantidad_actual'] + item['stock_minimo'] # type: ignore
        prov = item['proveedor'] or "Sin asignar" # type: ignore
        tel = item['telefono'] or "-" # type: ignore
        mensaje_wa += f"🔸 *{item['ingrediente']}* (Stock: {item['cantidad_actual']}{item['unidad']})\n" # type: ignore
        mensaje_wa += f"   👉 Pedir a: {prov} ({tel})\n"
        mensaje_wa += f"   📦 Sugerido: {comprar}{item['unidad']}\n\n" # type: ignore
    return {"status": "success", "mensaje_generado": mensaje_wa}
