// MODO DESARROLLO (Local)
// const API_URL = 'http://127.0.0.1:8000/api';

// MODO PRODUCCIÓN (Nube)
const API_URL = 'https://gastrostock-27s9.onrender.com/api';

const loader = document.getElementById('loading');
const toggleLoader = (show) => loader.style.display = show ? 'flex' : 'none';

async function cargarDashboard() {
    try {
        const res = await fetch(`${API_URL}/reportes/valorizacion`);
        const data = await res.json();
        document.getElementById('capital-total').innerText = `S/ ${data.capital_total_almacen.toFixed(2)}`;

        const tbody = document.getElementById('tabla-inventario');
        const select = document.getElementById('id_inventario');
        tbody.innerHTML = '';
        select.innerHTML = '<option value="">Seleccione un insumo...</option>';

        const resInv = await fetch(`${API_URL}/inventario`);
        const inventarioData = await resInv.json();

        inventarioData.data.forEach(item => {
            select.innerHTML += `<option value="${item.id}">${item.ingrediente} (${item.unidad})</option>`;

            const estadoHtml = item.alerta_compra 
                ? `<span class="badge badge-danger">Crítico</span>` 
                : `<span class="badge badge-success">Óptimo</span>`;

            const costoUnit = item.costo_unitario || 0;
            const valorizado = (item.cantidad_actual * costoUnit).toFixed(2);

            tbody.innerHTML += `
                <tr>
                    <td><strong>${item.ingrediente}</strong></td>
                    <td>${item.cantidad_actual} ${item.unidad}</td>
                    <td>${estadoHtml}</td>
                    <td>S/ ${valorizado}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
        alert("No se pudo conectar con el servidor. Verifica que el backend esté corriendo.");
    }
}

document.getElementById('formMovimiento').addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoader(true);

    const payload = {
        id_inventario: parseInt(document.getElementById('id_inventario').value),
        tipo: document.getElementById('tipo').value,
        cantidad: parseFloat(document.getElementById('cantidad').value),
        motivo: document.getElementById('motivo').value,
        usuario: document.getElementById('usuario').value
    };

    try {
        const response = await fetch(`${API_URL}/movimientos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if(response.ok) {
            document.getElementById('formMovimiento').reset();
            await cargarDashboard();
            alert("Operación registrada exitosamente en el sistema.");
        } else {
            alert("Error interno al procesar la transacción.");
        }
    } catch (error) {
        console.error(error);
        alert("Fallo de conexión al intentar guardar.");
    } finally {
        toggleLoader(false);
    }
});

async function enviarAlertaWhatsApp() {
    toggleLoader(true);
    try {
        const res = await fetch(`${API_URL}/alertas/compras`);
        const data = await res.json();
        
        if(data.mensaje_generado.includes("Todo en orden")) {
            alert("El inventario se encuentra en niveles óptimos.");
            toggleLoader(false);
            return;
        }

        const EVOLUTION_URL = "https://tu-dominio-evolution.com"; 
        const INSTANCE_NAME = "nombre_de_tu_instancia"; 
        const API_KEY = "TU_GLOBAL_API_KEY_AQUI"; 
        const NUMERO_GERENTE = "51982887891";

        const responseWsp = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': API_KEY
            },
            body: JSON.stringify({
                number: NUMERO_GERENTE,
                text: data.mensaje_generado
            })
        });

        if (responseWsp.ok) {
            alert("Reporte enviado exitosamente al dispositivo de Gerencia.");
        } else {
            console.error(await responseWsp.text());
            alert("Fallo de comunicación con la pasarela de mensajería.");
        }

    } catch (error) {
        console.error(error);
        alert("Fallo de conexión con el servidor interno al generar la alerta.");
    } finally {
        toggleLoader(false);
    }
}

cargarDashboard();
