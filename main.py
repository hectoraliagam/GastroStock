import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mysql.connector

app = FastAPI(title="GastroStock API", version="1.0", description="API para gestión de inventarios y sucursales")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# ==========================================
# CONFIGURACIÓN Y UTILIDADES
# ==========================================
def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "hectoraliagam"),
        password=os.getenv("DB_PASSWORD", "1234"),
        database=os.getenv("DB_NAME", "restaurante_pro_db"),
        port=os.getenv("DB_PORT", 3306)
    )

# ==========================================
# MODELOS DE DATOS (PYDANTIC)
# ==========================================
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

class NuevoCliente(BaseModel):
    nombre_restaurante: str
    username: str
    password: str

class EstadoCliente(BaseModel):
    estado: str

class NuevoUsuario(BaseModel):
    username: str
    password: str
    rol: str = "empleado"

# ==========================================
# RUTAS: AUTENTICACIÓN
# ==========================================
@app.post("/api/login", tags=["Autenticación"])
def login(data: LoginData):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    query = """
        SELECT u.id, u.id_restaurante, u.username, u.rol, r.estado 
        FROM usuarios u 
        LEFT JOIN restaurantes r ON u.id_restaurante = r.id 
        WHERE u.username = %s AND u.password = %s
    """
    cursor.execute(query, (data.username, data.password))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    
    if user['rol'] != 'superadmin' and user['estado'] == 'suspendido': # type: ignore
        raise HTTPException(status_code=403, detail="Membresía suspendida. Contacte al proveedor.")
        
    return {"status": "success", "user": user}

# ==========================================
# RUTAS: SUPERADMIN (GESTIÓN DE CLIENTES)
# ==========================================
@app.get("/api/admin/restaurantes", tags=["Superadmin"])
def admin_get_restaurantes():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT r.id, r.nombre, r.estado, u.username, u.password 
        FROM restaurantes r
        LEFT JOIN usuarios u ON r.id = u.id_restaurante AND u.rol = 'dueno'
        ORDER BY r.id DESC
    """)
    clientes = cursor.fetchall()
    cursor.close()
    conn.close()
    return {"status": "success", "data": clientes}

@app.post("/api/admin/restaurantes", tags=["Superadmin"])
def admin_crear_cliente(cliente: NuevoCliente):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conn.start_transaction()
        cursor.execute("INSERT INTO restaurantes (nombre) VALUES (%s)", (cliente.nombre_restaurante,))
        nuevo_id_rest = cursor.lastrowid
        cursor.execute("INSERT INTO usuarios (id_restaurante, username, password, rol) VALUES (%s, %s, %s, 'dueno')", 
                    (nuevo_id_rest, cliente.username, cliente.password))
        conn.commit()
        return {"status": "success", "message": "Cliente creado exitosamente"}
    except mysql.connector.Error as err:
        conn.rollback()
        if err.errno == 1062:
            raise HTTPException(status_code=400, detail="Ese nombre de usuario ya existe")
        raise HTTPException(status_code=400, detail=str(err))
    finally:
        cursor.close()
        conn.close()

@app.put("/api/admin/restaurantes/{id_restaurante}/estado", tags=["Superadmin"])
def admin_cambiar_estado(id_restaurante: int, data: EstadoCliente):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE restaurantes SET estado = %s WHERE id = %s", (data.estado, id_restaurante))
        conn.commit()
        return {"status": "success", "message": f"Estado cambiado a {data.estado}"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/admin/restaurantes/{id_restaurante}", tags=["Superadmin"])
def admin_eliminar_cliente(id_restaurante: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM restaurantes WHERE id = %s", (id_restaurante,))
        conn.commit()
        return {"status": "success", "message": "Cliente eliminado con todos sus datos"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

# ==========================================
# RUTAS: INVENTARIO Y MOVIMIENTOS
# ==========================================
@app.get("/api/inventario/{id_restaurante}", tags=["Inventario"])
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

@app.post("/api/inventario/{id_restaurante}", tags=["Inventario"])
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

@app.put("/api/inventario/{id_restaurante}/{id_insumo}", tags=["Inventario"])
def editar_insumo(id_restaurante: int, id_insumo: int, item: ItemInventario):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        sql = """
            UPDATE inventario 
            SET ingrediente = %s, unidad = %s, stock_minimo = %s, costo_unitario = %s 
            WHERE id = %s AND id_restaurante = %s
        """
        cursor.execute(sql, (item.ingrediente, item.unidad, item.stock_minimo, item.costo_unitario, id_insumo, id_restaurante))
        conn.commit()
        return {"status": "success", "message": "Insumo actualizado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/inventario/{id_restaurante}/{id_insumo}", tags=["Inventario"])
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

@app.post("/api/movimientos", tags=["Kardex"])
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

# ==========================================
# RUTAS: REPORTES Y ALERTAS
# ==========================================
@app.get("/api/reportes/valorizacion/{id_restaurante}", tags=["Reportes"])
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

@app.get("/api/alertas/compras/{id_restaurante}", tags=["Reportes"])
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
    
    mensaje_wa = "ALERTA DE COMPRAS - CIERRE DE TURNO \n\n"
    for item in faltantes:
        comprar = item['stock_minimo'] - item['cantidad_actual'] + item['stock_minimo'] # type: ignore
        prov = item['proveedor'] or "Sin asignar" # type: ignore
        tel = item['telefono'] or "-" # type: ignore
        mensaje_wa += f"- {item['ingrediente']} (Stock: {item['cantidad_actual']}{item['unidad']})\n" # type: ignore
        mensaje_wa += f"  Proveedor: {prov} ({tel})\n"
        mensaje_wa += f"  Sugerido: {comprar}{item['unidad']}\n\n" # type: ignore
    return {"status": "success", "mensaje_generado": mensaje_wa}

# ==========================================
# RUTAS: GESTIÓN DE USUARIOS
# ==========================================
@app.get("/api/usuarios/{id_restaurante}", tags=["Usuarios"])
def obtener_usuarios(id_restaurante: int):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, username, rol FROM usuarios WHERE id_restaurante = %s", (id_restaurante,))
    usuarios = cursor.fetchall()
    cursor.close()
    conn.close()
    return {"status": "success", "data": usuarios}

@app.post("/api/usuarios/{id_restaurante}", tags=["Usuarios"])
def crear_usuario(id_restaurante: int, user: NuevoUsuario):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO usuarios (id_restaurante, username, password, rol) VALUES (%s, %s, %s, %s)",
                    (id_restaurante, user.username, user.password, user.rol))
        conn.commit()
        return {"status": "success", "message": "Usuario creado exitosamente"}
    except mysql.connector.Error as err:
        conn.rollback()
        if err.errno == 1062:
            raise HTTPException(status_code=400, detail="Ese nombre de usuario ya existe.")
        raise HTTPException(status_code=400, detail=str(err))
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/usuarios/{id_restaurante}/{id_usuario}", tags=["Usuarios"])
def eliminar_usuario(id_restaurante: int, id_usuario: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM usuarios WHERE id = %s AND id_restaurante = %s AND rol != 'dueno'", (id_usuario, id_restaurante))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=400, detail="No se pudo eliminar (Usuario no encontrado o es el Dueño principal).")
        conn.commit()
        return {"status": "success", "message": "Usuario eliminado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()
        
# ==========================================
# RUTAS: REPORTES
# ==========================================
@app.get("/api/reportes/kpis/{id_restaurante}", tags=["Reportes"])
def obtener_kpis_dashboard(id_restaurante: int):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # KPI 1: Capital Inmovilizado Total
    cursor.execute("SELECT SUM(cantidad_actual * costo_unitario) as capital FROM inventario WHERE id_restaurante = %s", (id_restaurante,))
    capital = cursor.fetchone()['capital'] or 0 # type: ignore
    
    # KPI 2: Conteo de Alertas Críticas
    cursor.execute("SELECT COUNT(*) as alertas FROM inventario WHERE id_restaurante = %s AND cantidad_actual <= stock_minimo", (id_restaurante,))
    alertas = cursor.fetchone()['alertas'] or 0 # type: ignore
    
    # KPI 3: Movimientos Registrados
    cursor.execute("SELECT tipo, COUNT(*) as total FROM movimientos m JOIN inventario i ON m.id_inventario = i.id WHERE i.id_restaurante = %s GROUP BY tipo", (id_restaurante,))
    movimientos = cursor.fetchall()
    
    # KPI 4: Proveedores Activos
    cursor.execute("SELECT nombre, dias_entrega, telefono FROM proveedores WHERE id_restaurante = %s", (id_restaurante,))
    proveedores = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    return {
        "status": "success", 
        "kpis": {
            "capital": float(capital), # type: ignore
            "alertas": alertas, 
            "movimientos": movimientos, 
            "proveedores": proveedores
        }
    }
