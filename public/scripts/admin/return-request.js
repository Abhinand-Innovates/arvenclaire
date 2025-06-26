// Return Request Management JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize event listeners
    initializeEventListeners();
    
    // Load return requests
    loadReturnRequests();
});

function initializeEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('returnSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Status filter
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', handleStatusFilter);
    }
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handleSearch() {
    const searchTerm = document.getElementById('returnSearch').value;
        loadReturnRequests(searchTerm);
}

function handleStatusFilter() {
    const statusFilter = document.getElementById('statusFilter').value;
        loadReturnRequests(null, statusFilter);
}

function loadReturnRequests(searchTerm = '', statusFilter = '') {
    // This function can be used for dynamic loading if needed
}

// Approve return request with modern modal
function approveReturn(requestId) {
    Swal.fire({
        title: '<i class="fas fa-check-circle text-success"></i> Approve Return Request',
        html: `
            <div class="approval-modal-content">
                <p class="modal-description">Are you sure you want to approve this return request?</p>
                <div class="approval-details">
                    <div class="detail-item">
                        <i class="fas fa-undo text-primary"></i>
                        <span>Product quantity will be restored</span>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-wallet text-success"></i>
                        <span>Refund will be added to customer's wallet</span>
                    </div>
                </div>
                <div class="form-group mt-3">
                    <label for="adminNote" class="form-label">Admin Note (Optional)</label>
                    <textarea id="adminNote" class="form-control" rows="3" placeholder="Add any additional notes for the customer..."></textarea>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-check"></i> Approve Return',
        cancelButtonText: '<i class="fas fa-times"></i> Cancel',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        customClass: {
            popup: 'modern-modal',
            title: 'modern-modal-title',
            content: 'modern-modal-content',
            confirmButton: 'modern-btn modern-btn-success',
            cancelButton: 'modern-btn modern-btn-secondary'
        },
        preConfirm: () => {
            const adminNote = document.getElementById('adminNote').value;
            return { adminNote };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            executeApproval(requestId, result.value.adminNote);
        }
    });
}

// Reject return request with modern modal
function rejectReturn(requestId) {
    Swal.fire({
        title: '<i class="fas fa-times-circle text-danger"></i> Reject Return Request',
        html: `
            <div class="rejection-modal-content">
                <p class="modal-description">Please provide a reason for rejecting this return request:</p>
                <div class="form-group">
                    <label for="rejectionReason" class="form-label required">Rejection Reason</label>
                    <select id="rejectionReason" class="form-select" onchange="handleRejectionReasonChange()">
                        <option value="">Select a reason...</option>
                        <option value="Return window expired">Return window expired</option>
                        <option value="Product condition not acceptable">Product condition not acceptable</option>
                        <option value="Missing original packaging">Missing original packaging</option>
                        <option value="Product shows signs of use">Product shows signs of use</option>
                        <option value="Incomplete return (missing accessories)">Incomplete return (missing accessories)</option>
                        <option value="Policy violation">Policy violation</option>
                        <option value="Insufficient documentation">Insufficient documentation</option>
                        <option value="Other">Other (specify below)</option>
                    </select>
                </div>
                <div class="form-group mt-3">
                    <label for="customRejectionReason" class="form-label">Additional Details</label>
                    <textarea id="customRejectionReason" class="form-control" rows="3" placeholder="Provide additional details about the rejection..."></textarea>
                </div>
                <div class="rejection-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>The customer will be notified about this rejection with the reason provided.</span>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-times"></i> Reject Return',
        cancelButtonText: '<i class="fas fa-arrow-left"></i> Cancel',
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        customClass: {
            popup: 'modern-modal',
            title: 'modern-modal-title',
            content: 'modern-modal-content',
            confirmButton: 'modern-btn modern-btn-danger',
            cancelButton: 'modern-btn modern-btn-secondary'
        },
        preConfirm: () => {
            const rejectionReason = document.getElementById('rejectionReason').value;
            const customReason = document.getElementById('customRejectionReason').value;
            
            if (!rejectionReason) {
                Swal.showValidationMessage('Please select a rejection reason');
                return false;
            }
            
            let finalReason = rejectionReason;
            if (rejectionReason === 'Other' && !customReason.trim()) {
                Swal.showValidationMessage('Please provide additional details for "Other" reason');
                return false;
            }
            
            if (rejectionReason === 'Other') {
                finalReason = customReason.trim();
            } else if (customReason.trim()) {
                finalReason += ` - ${customReason.trim()}`;
            }
            
            return { rejectionReason: finalReason };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            executeRejection(requestId, result.value.rejectionReason);
        }
    });
}

function handleRejectionReasonChange() {
    const reasonSelect = document.getElementById('rejectionReason');
    const customTextarea = document.getElementById('customRejectionReason');
    
    if (reasonSelect.value === 'Other') {
        customTextarea.required = true;
        customTextarea.placeholder = 'Please specify the reason for rejection...';
        customTextarea.focus();
    } else {
        customTextarea.required = false;
        customTextarea.placeholder = 'Provide additional details about the rejection...';
    }
}

// Execute approval
async function executeApproval(requestId, adminNote) {
    try {
        // Show loading
        Swal.fire({
            title: 'Processing...',
            html: 'Approving return request and processing refund...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const response = await fetch(`/return-requests/${requestId}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ adminNote })
        });

        const result = await response.json();

        if (result.success) {
            Swal.fire({
                icon: 'success',
                title: 'Return Approved!',
                html: `
                    <div class="success-content">
                        <p>${result.message}</p>
                        <div class="success-details">
                            <div class="detail-item">
                                <i class="fas fa-check text-success"></i>
                                <span>Product quantity restored</span>
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-wallet text-success"></i>
                                <span>Refund processed to customer wallet</span>
                            </div>
                        </div>
                    </div>
                `,
                confirmButtonText: 'OK',
                confirmButtonColor: '#28a745'
            }).then(() => {
                window.location.reload();
            });
        } else {
            throw new Error(result.message || 'Failed to approve return request');
        }
    } catch (error) {
        console.error('Error approving return:', error);
        Swal.fire({
            icon: 'error',
            title: 'Approval Failed',
            text: error.message || 'Failed to approve return request. Please try again.',
            confirmButtonColor: '#dc3545'
        });
    }
}

// Execute rejection
async function executeRejection(requestId, rejectionReason) {
    try {
        // Show loading
        Swal.fire({
            title: 'Processing...',
            html: 'Rejecting return request...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const response = await fetch(`/return-requests/${requestId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ rejectionReason })
        });

        const result = await response.json();

        if (result.success) {
            Swal.fire({
                icon: 'info',
                title: 'Return Rejected',
                html: `
                    <div class="rejection-success-content">
                        <p>${result.message}</p>
                        <div class="rejection-details">
                            <strong>Rejection Reason:</strong>
                            <p class="rejection-reason">${rejectionReason}</p>
                        </div>
                        <div class="notification-info">
                            <i class="fas fa-bell text-info"></i>
                            <span>Customer has been notified about the rejection</span>
                        </div>
                    </div>
                `,
                confirmButtonText: 'OK',
                confirmButtonColor: '#6c757d'
            }).then(() => {
                window.location.reload();
            });
        } else {
            throw new Error(result.message || 'Failed to reject return request');
        }
    } catch (error) {
        console.error('Error rejecting return:', error);
        Swal.fire({
            icon: 'error',
            title: 'Rejection Failed',
            text: error.message || 'Failed to reject return request. Please try again.',
            confirmButtonColor: '#dc3545'
        });
    }
}

function processReturn(requestId) {
    Swal.fire({
        title: 'Process Return',
        text: `Mark return request ${requestId} as completed?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Process',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#007bff'
    }).then((result) => {
        if (result.isConfirmed) {
            // TODO: Implement process return functionality
            showAlert('Return processed successfully', 'success');
        }
    });
}

async function viewReturnDetails(requestId) {
    try {
        // Show loading
        Swal.fire({
            title: 'Loading...',
            html: 'Fetching return request details...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Fetch order details
        const response = await fetch(`/get-orders/${requestId}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to fetch order details');
        }

        const order = result.order;
        
        // Determine current status for display
        let currentStatus = order.status;
        let statusClass = 'info';
        
        if (order.returnRejectedAt && order.status === 'Delivered') {
            currentStatus = 'Rejected';
            statusClass = 'danger';
        } else if (order.status === 'Return Request') {
            currentStatus = 'Pending Review';
            statusClass = 'warning';
        } else if (order.status === 'Returned') {
            currentStatus = 'Completed';
            statusClass = 'success';
        }

        // Build timeline
        let timeline = '';
        if (order.returnRequestedAt) {
            timeline += `<div class="timeline-item">
                <i class="fas fa-clock text-primary"></i>
                <span><strong>Return Requested:</strong> ${new Date(order.returnRequestedAt).toLocaleString()}</span>
            </div>`;
        }
        
        if (order.returnApprovedAt) {
            timeline += `<div class="timeline-item">
                <i class="fas fa-check text-success"></i>
                <span><strong>Return Approved:</strong> ${new Date(order.returnApprovedAt).toLocaleString()}</span>
            </div>`;
        }
        
        if (order.returnRejectedAt) {
            timeline += `<div class="timeline-item">
                <i class="fas fa-times text-danger"></i>
                <span><strong>Return Rejected:</strong> ${new Date(order.returnRejectedAt).toLocaleString()}</span>
            </div>`;
        }

        // Build product list
        let productList = '';
        if (order.orderedItems && order.orderedItems.length > 0) {
            order.orderedItems.forEach(item => {
                productList += `
                    <div class="product-item">
                        <img src="${item.product?.productImages?.[0] || '/images/placeholder-product.jpg'}" 
                             alt="Product" class="product-thumb">
                        <div class="product-info">
                            <h6>${item.product?.productName || 'Product Name'}</h6>
                            <p>Quantity: ${item.quantity}</p>
                            <p>Price: ₹${item.price?.toLocaleString() || '0'}</p>
                        </div>
                    </div>
                `;
            });
        }

        const detailsHtml = `
            <div class="return-details-modal">
                <div class="status-header">
                    <span class="badge bg-${statusClass} fs-6">${currentStatus}</span>
                </div>
                
                <div class="details-grid">
                    <div class="detail-section">
                        <h6><i class="fas fa-shopping-cart"></i> Order Information</h6>
                        <div class="detail-content">
                            <p><strong>Order ID:</strong> ${order.orderId}</p>
                            <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                            <p><strong>Total Amount:</strong> ₹${order.finalAmount.toLocaleString()}</p>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h6><i class="fas fa-user"></i> Customer Information</h6>
                        <div class="detail-content">
                            <p><strong>Name:</strong> ${order.userId?.fullname || order.shippingAddress?.name || 'N/A'}</p>
                            <p><strong>Email:</strong> ${order.userId?.email || 'N/A'}</p>
                            <p><strong>Phone:</strong> ${order.shippingAddress?.phone || 'N/A'}</p>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <h6><i class="fas fa-box"></i> Products</h6>
                    <div class="products-list">
                        ${productList}
                    </div>
                </div>

                ${order.returnReason ? `
                <div class="detail-section">
                    <h6><i class="fas fa-comment-alt"></i> Return Reason</h6>
                    <div class="detail-content">
                        <p class="return-reason-text">${order.returnReason}</p>
                    </div>
                </div>
                ` : ''}

                ${order.adminNote ? `
                <div class="detail-section">
                    <h6><i class="fas fa-user-shield"></i> Admin Note</h6>
                    <div class="detail-content">
                        <p class="admin-note-text">${order.adminNote}</p>
                    </div>
                </div>
                ` : ''}

                ${order.rejectionReason ? `
                <div class="detail-section">
                    <h6><i class="fas fa-exclamation-triangle"></i> Rejection Reason</h6>
                    <div class="detail-content">
                        <p class="rejection-reason-text">${order.rejectionReason}</p>
                    </div>
                </div>
                ` : ''}

                ${timeline ? `
                <div class="detail-section">
                    <h6><i class="fas fa-history"></i> Return Timeline</h6>
                    <div class="timeline">
                        ${timeline}
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        Swal.fire({
            title: `Return Request Details - ${order.orderId}`,
            html: detailsHtml,
            width: '900px',
            confirmButtonText: 'Close',
            confirmButtonColor: '#6c757d',
            customClass: {
                popup: 'modern-modal-large return-details-popup'
            }
        });

    } catch (error) {
        console.error('Error fetching return details:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to load return request details',
            confirmButtonColor: '#dc3545'
        });
    }
}

function showAlert(message, type = 'info') {
    const alertClass = type === 'success' ? 'alert-success' : 
                     type === 'error' ? 'alert-danger' : 
                     type === 'warning' ? 'alert-warning' : 'alert-info';
    
    Swal.fire({
        title: type === 'success' ? 'Success!' : 
               type === 'error' ? 'Error!' : 
               type === 'warning' ? 'Warning!' : 'Info',
        text: message,
        icon: type === 'success' ? 'success' : 
              type === 'error' ? 'error' : 
              type === 'warning' ? 'warning' : 'info',
        confirmButtonColor: '#000000',
        confirmButtonText: 'OK'
    });
}

// Utility function to update table (for future use)
function updateReturnTable(requests) {
    // Update table with requests
}

// Utility function to update pagination (for future use)
function updatePagination(pagination) {
    // Update pagination
}