from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mysql.connector

app = FastAPI()

# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelo de datos esperado desde el Frontend
class ItemInventario(BaseModel):
    ingrediente: str
    unidad: str
    cantidad_actual: float
    stock_minimo: float

def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="hectoraliagam", 
        password="1234", 
        database="restaurante_db"
    )

# READ: Obtener todos los items
@app.get("/api/inventario")
def obtener_inventario():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM inventario ORDER BY ingrediente ASC")
    items = cursor.fetchall()
    cursor.close()
    conn.close()
    
    for item in items:
        # Validar alerta comparando floats
        item["alerta_compra"] = float(item["cantidad_actual"]) <= float(item["stock_minimo"]) # type: ignore
        
    return {"status": "success", "data": items}

# CREATE: Agregar nuevo insumo
@app.post("/api/inventario")
def crear_item(item: ItemInventario):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = "INSERT INTO inventario (ingrediente, unidad, cantidad_actual, stock_minimo) VALUES (%s, %s, %s, %s)"
    val = (item.ingrediente, item.unidad, item.cantidad_actual, item.stock_minimo)
    cursor.execute(sql, val)
    conn.commit()
    item_id = cursor.lastrowid
    cursor.close()
    conn.close()
    return {"status": "success", "message": "Insumo registrado exitosamente", "id": item_id}

# UPDATE: Actualizar insumo (ej. cambiar stock)
@app.put("/api/inventario/{item_id}")
def actualizar_item(item_id: int, item: ItemInventario):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = "UPDATE inventario SET ingrediente=%s, unidad=%s, cantidad_actual=%s, stock_minimo=%s WHERE id=%s"
    val = (item.ingrediente, item.unidad, item.cantidad_actual, item.stock_minimo, item_id)
    cursor.execute(sql, val)
    conn.commit()
    cursor.close()
    conn.close()
    return {"status": "success", "message": "Insumo actualizado"}

# DELETE: Eliminar insumo
@app.delete("/api/inventario/{item_id}")
def eliminar_item(item_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM inventario WHERE id = %s", (item_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return {"status": "success", "message": "Insumo eliminado"}
