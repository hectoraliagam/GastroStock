from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import mysql.connector

app = FastAPI()

# Configuración CORS para que el Frontend (JS) pueda hacer peticiones
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="hectoraliagam", # Tu usuario
        password="1234", # Tu contraseña
        database="restaurante_db"
    )

@app.get("/api/inventario")
def obtener_inventario():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("SELECT * FROM inventario ORDER BY ingrediente ASC")
    items = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    # Lógica de negocio: Agregar un flag si hay que comprar
    for item in items:
        item["alerta_compra"] = item["cantidad_actual"] <= item["stock_minimo"] # type: ignore
        
    return {"status": "success", "data": items}
