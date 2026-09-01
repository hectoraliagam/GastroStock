import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mysql.connector

app = FastAPI()

app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"]
)

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "hectoraliagam"),
        password=os.getenv("DB_PASSWORD", "1234"),
        database=os.getenv("DB_NAME", "restaurante_pro_db"),
        port=os.getenv("DB_PORT", 3306)
    )

class Movimiento(BaseModel):
    id_inventario: int
    tipo: str
    cantidad: float
    motivo: str
    usuario: str

@app.get("/api/inventario")
def obtener_inventario():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM inventario ORDER BY ingrediente ASC")
    items = cursor.fetchall()
    cursor.close()
    conn.close()
    for item in items:
        item["alerta_compra"] = float(item["cantidad_actual"]) <= float(item["stock_minimo"]) # type: ignore
    return {"status": "success", "data": items}

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
        return {"status": "success", "message": "Movimiento registrado y stock actualizado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Error en la transacción: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@app.get("/api/reportes/valorizacion")
def reporte_valorizacion():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT ingrediente, cantidad_actual, costo_unitario, 
               (cantidad_actual * costo_unitario) as capital_invertido 
        FROM inventario WHERE cantidad_actual > 0
    """)
    items = cursor.fetchall()
    total_capital = sum(item['capital_invertido'] for item in items) # type: ignore
    cursor.close()
    conn.close()
    return {
        "capital_total_almacen": round(total_capital, 2),
        "detalle": items
    }

@app.get("/api/alertas/compras")
def generar_lista_compras_whatsapp():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT i.ingrediente, i.cantidad_actual, i.stock_minimo, i.unidad, p.nombre as proveedor, p.telefono
        FROM inventario i
        LEFT JOIN proveedores p ON i.id_proveedor = p.id
        WHERE i.cantidad_actual <= i.stock_minimo
    """)
    faltantes = cursor.fetchall()
    cursor.close()
    conn.close()
    
    if not faltantes:
        return {"mensaje_generado": "Todo en orden. No hay compras urgentes hoy."}
        
    mensaje_wa = "*⚠️ ALERTA DE COMPRAS - CIERRE DE TURNO* \n\n"
    for item in faltantes:
        comprar = item['stock_minimo'] - item['cantidad_actual'] + item['stock_minimo'] # type: ignore
        mensaje_wa += f"🔸 *{item['ingrediente']}* (Stock: {item['cantidad_actual']}{item['unidad']})\n" # type: ignore
        mensaje_wa += f"   👉 Pedir a: {item['proveedor']} ({item['telefono']})\n" # type: ignore
        mensaje_wa += f"   📦 Cantidad sugerida: {comprar}{item['unidad']}\n\n" # type: ignore
        
    return {"status": "success", "mensaje_generado": mensaje_wa}
