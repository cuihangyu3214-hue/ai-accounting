/**
 * 图表渲染 — Chart.js
 */

let trendChartInstance = null;

function renderTrendChart(canvasId, records) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (trendChartInstance) {
    trendChartInstance.destroy();
    trendChartInstance = null;
  }

  const expenses = records.filter(r => r.type === 'expense');

  // 按日期汇总
  const dayMap = {};
  expenses.forEach(r => {
    const day = parseInt(r.date.split('-')[2], 10);
    dayMap[day] = (dayMap[day] || 0) + r.amount;
  });

  // 获取当月天数
  const dates = records.length > 0 ? records[0].date.split('-') : [];
  let daysInMonth = 31;
  if (dates.length >= 2) {
    daysInMonth = new Date(parseInt(dates[0]), parseInt(dates[1]), 0).getDate();
  }

  const labels = [];
  const data = [];
  for (let d = 1; d <= daysInMonth; d++) {
    labels.push(d + '');
    data.push(dayMap[d] || 0);
  }

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, 'rgba(108,92,231,0.2)');
  grad.addColorStop(1, 'rgba(108,92,231,0)');

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#6C5CE7',
        borderWidth: 3,
        fill: true,
        backgroundColor: grad,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: '#6C5CE7',
        pointHoverBorderColor: 'white',
        pointHoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'white',
          titleColor: '#6C5CE7',
          titleFont: { weight: 700 },
          bodyColor: '#1a1a2e',
          bodyFont: { weight: 700, size: 14 },
          borderColor: 'rgba(108,92,231,0.15)',
          borderWidth: 1,
          cornerRadius: 12,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: (items) => items[0].label + '日',
            label: (c) => '¥' + c.parsed.y.toFixed(0)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: 'rgba(26,26,46,0.25)',
            font: { size: 10, weight: 600 },
            maxTicksLimit: 10
          },
          border: { display: false }
        },
        y: { display: false }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });
}
