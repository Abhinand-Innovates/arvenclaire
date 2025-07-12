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
    
    // Initialize notification system
    updateReturnRequestNotification();
    
    // Set up periodic notification updates (every 30 seconds)
    setInterval(updateReturnRequestNotification, 30000);
});

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Calculate current total (same logic as order details page)
function calculateCurrentTotal(order) {
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
    const includedItems = [...activeItems, ...returnRequestItems];
    
    let amountAfterDiscount = 0;
    includedItems.forEach(item => {
        amountAfterDiscount += item.totalPrice;
    });
    
    let currentTotal = amountAfterDiscount;
    if (includedItems.length > 0) {
        currentTotal += order.shippingCharges;
    }
    
    return currentTotal;
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

// Update return request notification
async function updateReturnRequestNotification() {
    try {
        const response = await fetch('/get-return-request-count', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const count = data.count || 0;
            
            // Update notification bell
            const notificationBell = document.getElementById('notificationBell');
            const notificationCounter = document.getElementById('notificationCounter');
            
            if (notificationBell && notificationCounter) {
                if (count > 0) {
                    notificationBell.classList.add('has-notifications');
                    notificationCounter.classList.remove('hidden');
                    notificationCounter.textContent = count;
                } else {
                    notificationBell.classList.remove('has-notifications');
                    notificationCounter.classList.add('hidden');
                    notificationCounter.textContent = '0';
                }
            }
            
            // Update sidebar notification badge if it exists
            const sidebarBadge = document.getElementById('returnRequestBadge');
            const sidebarCount = document.getElementById('returnRequestCount');
            
            if (sidebarBadge && sidebarCount) {
                if (count > 0) {
                    sidebarBadge.style.display = 'inline-block';
                    sidebarCount.textContent = count;
                } else {
                    sidebarBadge.style.display = 'none';
                    sidebarCount.textContent = '0';
                }
            }
        }
    } catch (error) {
        console.error('Error updating return request notification:', error);
    }
}

// Show notification when new return request is received
function showNewReturnRequestNotification() {
    // Show a toast notification
    if (typeof Swal !== 'undefined') {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer)
                toast.addEventListener('mouseleave', Swal.resumeTimer)
            }
        });

        Toast.fire({
            icon: 'info',
            title: 'New Return Request',
            text: 'A new return request has been submitted by a customer.'
        });
    }
    
    // Update notification immediately
    updateReturnRequestNotification();
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
                    <strong>₹${calculateCurrentTotal(order).toFixed(2)}</strong>
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
    
    // Populate status options based on current status and flow restrictions
    populateStatusOptions(currentStatus);
    
    const modal = new bootstrap.Modal(document.getElementById('statusUpdateModal'));
    modal.show();
}

// Populate status options based on current status and flow restrictions
function populateStatusOptions(currentStatus) {
    const statusSelect = document.getElementById('newStatus');
    statusSelect.innerHTML = '<option value="">Choose status...</option>';
    
    // Define the sequential flow
    const statusFlow = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Return Request', 'Returned'];
    const currentIndex = statusFlow.indexOf(currentStatus);
    
    let allowedStatuses = [];
    
    switch (currentStatus) {
        case 'Pending':
            allowedStatuses = ['Processing', 'Cancelled'];
            break;
        case 'Processing':
            allowedStatuses = ['Shipped', 'Cancelled'];
            break;
        case 'Shipped':
            allowedStatuses = ['Delivered'];
            break;
        case 'Delivered':
            allowedStatuses = ['Return Request'];
            break;
        case 'Return Request':
            allowedStatuses = ['Returned'];
            break;
        case 'Returned':
        case 'Cancelled':
            // Final states - no further changes allowed
            allowedStatuses = [];
            break;
        default:
            // For any other status, allow next in sequence
            if (currentIndex !== -1 && currentIndex < statusFlow.length - 1) {
                allowedStatuses = [statusFlow[currentIndex + 1]];
            }
    }
    
    // Add options to select
    allowedStatuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        statusSelect.appendChild(option);
    });
    
    // If no allowed statuses, show message
    if (allowedStatuses.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No status changes allowed';
        option.disabled = true;
        statusSelect.appendChild(option);
    }
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
