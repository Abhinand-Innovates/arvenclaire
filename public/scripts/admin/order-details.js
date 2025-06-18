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
    console.log('Order details page loaded');
});
