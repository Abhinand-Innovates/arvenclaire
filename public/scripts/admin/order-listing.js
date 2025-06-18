let currentPage = 1;
const ordersPerPage = 10;
let totalPages = 1;

document.addEventListener('DOMContentLoaded', function() {
    const orderSearch = document.getElementById('orderSearch');
    const statusFilter = document.getElementById('statusFilter');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');

    // Search functionality
    orderSearch.addEventListener('input', debounce(function() {
        currentPage = 1;
        fetchOrders();
    }, 300));

    // Status filter functionality
    statusFilter.addEventListener('change', function() {
        currentPage = 1;
        fetchOrders();
    });

    // Pagination controls
    prevPage.addEventListener('click', function(e) {
        e.preventDefault();
        if (currentPage > 1) {
            currentPage--;
            fetchOrders();
        }
    });

    nextPage.addEventListener('click', function(e) {
        e.preventDefault();
        if (currentPage < totalPages) {
            currentPage++;
            fetchOrders();
        }
    });

    // Initial fetch to ensure correct data
    fetchOrders();
});

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Navigate to page
function goToPage(page) {
    currentPage = page;
    fetchOrders();
}

// Fetch orders dynamically
async function fetchOrders() {
    const searchTerm = document.getElementById('orderSearch').value;
    const statusFilter = document.getElementById('statusFilter').value;

    try {
        const query = new URLSearchParams({
            search: searchTerm,
            page: currentPage,
            status: statusFilter
        }).toString();

        const response = await fetch(`/get-orders?${query}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch orders: ${response.status}`);
        }

        const data = await response.json();
        renderOrdersTable(data.orders, data);
    } catch (error) {
        console.error('Error fetching orders:', error.message);
        Swal.fire({
            title: 'Error',
            text: 'Failed to load orders. Please try again.',
            icon: 'error',
            confirmButtonColor: '#000000'
        });
    }
}

// Render orders table
function renderOrdersTable(orders, paginationData) {
    const tableBody = document.getElementById('ordersTableBody');
    tableBody.innerHTML = '';

    orders.forEach(order => {
        const customerName = order.userId?.fullname || order.shippingAddress.name;
        const customerEmail = order.userId?.email || 'N/A';
        const avatarChar = customerName.charAt(0).toUpperCase();
        
        const totalItems = order.orderedItems.reduce((total, item) => total + item.quantity, 0);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="order-id">
                    <strong>${order.orderId}</strong>
                </div>
            </td>
            <td>
                <div class="customer-info">
                    <div class="customer-avatar">
                        ${avatarChar}
                    </div>
                    <div class="customer-details">
                        <h6>${customerName}</h6>
                        <p>${customerEmail}</p>
                        <p>${order.shippingAddress.phone}</p>
                    </div>
                </div>
            </td>
            <td>
                <div class="order-date">
                    ${new Date(order.createdAt).toLocaleDateString()}
                    <br>
                    <small class="text-muted">${new Date(order.createdAt).toLocaleTimeString()}</small>
                </div>
            </td>
            <td>
                <div class="order-items">
                    <span class="item-count">${order.orderedItems.length} item(s)</span>
                    <br>
                    <small class="text-muted">Qty: ${totalItems}</small>
                </div>
            </td>
            <td>
                <div class="order-amount">
                    <strong>₹${order.finalAmount.toLocaleString()}</strong>
                    ${order.discount > 0 ? `<br><small class="text-success">-₹${order.discount.toLocaleString()} discount</small>` : ''}
                </div>
            </td>
            <td>
                <span class="payment-method">
                    ${order.paymentMethod}
                </span>
            </td>
            <td>
                <span class="status-badge status-${order.status.toLowerCase().replace(/\s+/g, '-')}">
                    ${order.status}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <a href="/get-orders/${order._id}/details" class="btn-action btn-view">
                        <i class="fas fa-eye"></i> View
                    </a>
                    <button class="btn-action btn-status" onclick="updateOrderStatus('${order._id}', '${order.status}')">
                        <i class="fas fa-edit"></i> Status
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });

    document.getElementById('showingStart').textContent = paginationData.startIdx + 1 || 0;
    document.getElementById('showingEnd').textContent = paginationData.endIdx || 0;
    document.getElementById('totalOrders').textContent = paginationData.totalOrders || 0;
    totalPages = paginationData.totalPages || 1;

    updatePagination();
}

// Update pagination links
function updatePagination() {
    const pagination = document.getElementById('pagination');
    const pageLinks = pagination.querySelectorAll('.page-item:not(#prevPage):not(#nextPage)');
    pageLinks.forEach(link => link.remove());

    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="goToPage(${i})">${i}</a>`;
        pagination.insertBefore(li, document.getElementById('nextPage'));
    }

    document.getElementById('prevPage').classList.toggle('disabled', currentPage === 1);
    document.getElementById('nextPage').classList.toggle('disabled', currentPage === totalPages);
}



// Update order status
function updateOrderStatus(orderId, currentStatus) {
    document.getElementById('updateOrderId').value = orderId;
    document.getElementById('newStatus').value = currentStatus;
    
    const modal = new bootstrap.Modal(document.getElementById('statusUpdateModal'));
    modal.show();
}

// Confirm status update
async function confirmStatusUpdate() {
    const orderId = document.getElementById('updateOrderId').value;
    const newStatus = document.getElementById('newStatus').value;
    
    if (!newStatus) {
        Swal.fire({
            title: 'Error',
            text: 'Please select a status.',
            icon: 'error',
            confirmButtonColor: '#000000'
        });
        return;
    }

    try {
        const response = await fetch(`/get-orders/${orderId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            throw new Error(`Failed to update order status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            Swal.fire({
                title: 'Success!',
                text: 'Order status updated successfully.',
                icon: 'success',
                confirmButtonColor: '#000000'
            });
            
            // Close modal and refresh table
            bootstrap.Modal.getInstance(document.getElementById('statusUpdateModal')).hide();
            fetchOrders();
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Error updating order status:', error.message);
        Swal.fire({
            title: 'Error',
            text: 'Failed to update order status. Please try again.',
            icon: 'error',
            confirmButtonColor: '#000000'
        });
    }
}
