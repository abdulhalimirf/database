document.addEventListener('DOMContentLoaded', function () {
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach((alert) => {
    setTimeout(() => {
      alert.style.display = 'none';
    }, 3500);
  });

  document.querySelectorAll('.delete-form').forEach((form) => {
    form.addEventListener('submit', function (event) {
      const confirmed = confirm('Are you sure you want to delete this person?');
      if (!confirmed) {
        event.preventDefault();
      }
    });
  });
});