// Function to convert square feet to acres
function squareFeetToAcres(sqFt) {
  return (sqFt / 43560).toFixed(4); // Round to 4 decimal places for precision
}

// Function to find and update the ruler panel
function updateRulerPanel() {
  const rulerDiv = document.querySelector('#ruler');
  if (!rulerDiv) return;

  // Get all child divs inside #ruler (or its subtree) that look like metric displays
  const metricDivs = rulerDiv.querySelectorAll('div');
  let areaElement = null;

  // Iterate to find area based on text content
  metricDivs.forEach(div => {
    const text = div.textContent.trim();
    if (text.startsWith('Total area:')) {
      areaElement = div;
    }
  });

  if (areaElement) {
    const areaText = areaElement.textContent.trim();
    // Parse the square feet value (handle commas and extract number before 'ft²')
    const sqFtMatch = areaText.match(/([\d,]+(?:\.\d+)?)\s*ft²/);
    if (sqFtMatch) {
      const sqFt = parseFloat(sqFtMatch[1].replace(/,/g, ''));
      const acres = squareFeetToAcres(sqFt);

      // Check if we've already added the acres element to avoid duplicates
      const acresDisplay = document.querySelector('#acres-display');
      if (!acresDisplay) {
        const acresElement = document.createElement('div');
        // Copy styles/classes from areaElement for consistent look (if classes are dynamic, this adapts)
        acresElement.className = areaElement.className;
        acresElement.id = 'acres-display'; // For easy duplicate check
        acresElement.textContent = `Total acres: ${acres}`;
        // Insert immediately after the area element
        areaElement.parentNode.insertBefore(acresElement, areaElement.nextSibling);
      } else {
        // Update existing element if values change
        acresDisplay.textContent = `Total acres: ${acres}`;
      }
    }
  }
}

// Initial check
updateRulerPanel();

// Poll every 500ms to handle dynamic updates (e.g., when polygon closes and area appears/updates)
setInterval(() => {
  if (document.querySelector('#ruler')) {
    updateRulerPanel();
  }
}, 500);