function like(path, el) {
  fetch(`/image${path.replace('uploads', '')}/like`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(res => {
    if (res.status === 201) {
      if (el.classList.contains('far')) {
        el.classList.remove('far');
        el.classList.add('fas');
      }
      else {
        el.classList.remove('fas');
        el.classList.add('far');
      }
    }
    
  }).catch(err => {
    console.error(err);
  });
};
