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

        const data = await response.json();
        
        if (data.success) {
            Swal.fire({
                title: 'Success!',
                text: 'Order status updated successfully.',
                icon: 'success',
                confirmButtonColor: '#000000'
            }).then(() => {
                // Reload the page to show updated status
                window.location.reload();
            });
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('statusUpdateModal')).hide();
        } else {
            // Handle specific error cases
            let errorTitle = 'Error';
            let errorIcon = 'error';
            
            if (response.status === 403) {
                errorTitle = 'Action Not Allowed';
                errorIcon = 'warning';
            }
            
            Swal.fire({
                title: errorTitle,
                text: data.message || 'Failed to update order status. Please try again.',
                icon: errorIcon,
                confirmButtonColor: '#000000'
            });
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


// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Add any initialization code here if needed
    // Order details page loaded
});
