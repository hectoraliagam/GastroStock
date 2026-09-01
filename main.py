from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mysql.connector

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def get_db_connection():
    return mysql.connector.connect(
        host="localhost", user="hectoraliagam", password="1234", database="restaurante_pro_db"
    )

# Modelos Pydantic
class Movimiento(BaseModel):
    id_inventario: int
    tipo: str  # 'entrada', 'salida', 'merma'
    cantidad: float
    motivo: str
    usuario: str

# 1. ENDPOINT KARDEX: Registra el movimiento y actualiza el stock real
@app.post("/api/movimientos")
def registrar_movimiento(mov: Movimiento):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Iniciar transacción
        conn.start_transaction()
        
        # Guardar en el historial
        sql_mov = "INSERT INTO movimientos (id_inventario, tipo, cantidad, motivo, usuario) VALUES (%s, %s, %s, %s, %s)"
        cursor.execute(sql_mov, (mov.id_inventario, mov.tipo, mov.cantidad, mov.motivo, mov.usuario))
        
        # Calcular el operador matematico
        operador = "+" if mov.tipo == 'entrada' else "-"
        
        # Actualizar el inventario
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

# 2. ENDPOINT VALORIZACIÓN: ¿Cuánto dinero hay en el almacén?
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

# 3. ENDPOINT WHATSAPP: El gancho de ventas
@app.get("/api/alertas/compras")
def generar_lista_compras_whatsapp():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Traemos solo lo que está por debajo del stock mínimo, uniendo con el proveedor
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

    # Formateamos un mensaje listo para disparar a una API de WhatsApp
    mensaje_wa = "*⚠️ ALERTA DE COMPRAS - CIERRE DE TURNO* \n\n"
    for item in faltantes:
        comprar = item['stock_minimo'] - item['cantidad_actual'] + item['stock_minimo'] # Sugerencia de compra # type: ignore
        mensaje_wa += f"🔸 *{item['ingrediente']}* (Stock: {item['cantidad_actual']}{item['unidad']})\n" # type: ignore
        mensaje_wa += f"   👉 Pedir a: {item['proveedor']} ({item['telefono']})\n" # type: ignore
        mensaje_wa += f"   📦 Cantidad sugerida: {comprar}{item['unidad']}\n\n" # type: ignore
        
    # Aquí puedes hacer la petición HTTP a Evolution API para enviar "mensaje_wa" directamente al celular del dueño
    
    return {"status": "success", "mensaje_generado": mensaje_wa}
