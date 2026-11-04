// Trang Items: ví dụ CRUD đầy đủ gọi sang backend.
//   Xem danh sách  -> GET    /items?q=...
//   Thêm           -> POST   /items
//   Sửa            -> PUT    /items/{id}
//   Xoá            -> DELETE /items/{id}
// Làm đề tài: copy file này + pages/items.html rồi đổi "items" thành tài nguyên của nhóm.

const form = document.getElementById("item-form");
const tableBody = document.getElementById("item-table-body");
const searchInput = document.getElementById("search-input");
const formTitle = document.getElementById("form-title");
const submitButton = document.getElementById("btn-submit");
const cancelButton = document.getElementById("btn-cancel");

let editingId = null; // null = đang thêm mới; có số = đang sửa item đó

// ---------- Đọc dữ liệu ----------
async function loadItems() {
  tableBody.innerHTML = `<tr><td colspan="5" class="muted">Đang tải...</td></tr>`;
  try {
    const keyword = searchInput.value.trim();
    // axios tự ghép params thành ?q=... (và tự mã hoá tiếng Việt)
    const items = await api.get("/items", keyword ? { q: keyword } : undefined);
    renderItems(items);
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-error">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderItems(items) {
  if (items.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="muted">Chưa có dữ liệu</td></tr>`;
    return;
  }
  tableBody.innerHTML = items.map((item) => `
    <tr>
      <td>${item.id}</td>
      <td>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted">${escapeHtml(item.description)}</div>
      </td>
      <td class="text-right">${formatMoney(item.price)}</td>
      <td>${formatDateTime(item.created_at)}</td>
      <td class="actions">
        <button class="btn btn-small" data-action="edit" data-id="${item.id}">Sửa</button>
        <button class="btn btn-small btn-danger" data-action="delete" data-id="${item.id}">Xoá</button>
      </td>
    </tr>`).join("");
}

// ---------- Thêm / Sửa ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault(); // không cho trình duyệt tự reload trang

  const data = {
    name: form.name.value.trim(),
    description: form.description.value.trim() || null,
    price: Number(form.price.value || 0),
  };

  submitButton.disabled = true;
  try {
    if (editingId === null) {
      await api.post("/items", data);
      showToast("Đã thêm item");
    } else {
      await api.put(`/items/${editingId}`, data);
      showToast("Đã cập nhật item");
    }
    resetForm();
    loadItems();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

async function startEdit(id) {
  try {
    const item = await api.get(`/items/${id}`);
    editingId = id;
    form.name.value = item.name;
    form.description.value = item.description ?? "";
    form.price.value = item.price;
    formTitle.textContent = `Sửa item #${id}`;
    submitButton.textContent = "Lưu thay đổi";
    cancelButton.hidden = false;
    form.name.focus();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = "Thêm item mới";
  submitButton.textContent = "Thêm";
  cancelButton.hidden = true;
}

// ---------- Xoá ----------
async function deleteItem(id) {
  if (!confirm(`Xoá item #${id}?`)) return;
  try {
    await api.delete(`/items/${id}`);
    showToast("Đã xoá item");
    if (editingId === id) resetForm();
    loadItems();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// Bắt sự kiện click cho các nút Sửa/Xoá trong bảng (event delegation)
tableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === "edit") startEdit(id);
  if (button.dataset.action === "delete") deleteItem(id);
});

cancelButton.addEventListener("click", resetForm);

// Tìm kiếm: gõ xong 300ms mới gọi API (tránh gọi liên tục mỗi phím)
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadItems, 300);
});

loadItems();
