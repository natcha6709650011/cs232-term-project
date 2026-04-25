// ฟังก์ชันสร้างแถวในตารางจากข้อมูล Array
function updateStudentTable(studentArray) {
    const tbody = document.getElementById('student-table-body');
    tbody.innerHTML = ""; // ล้างข้อมูล mockup ออกก่อน

    studentArray.forEach((student, index) => {
        const row = document.createElement('tr');
        row.className = "hover:bg-blue-50 border-b";
        row.innerHTML = `
            <td class="px-4 py-4 text-center">${index + 1}</td>
            <td class="px-4 py-4 font-medium">${student.id}</td>
            <td class="px-4 py-4">${student.name}</td>
            <td class="px-4 py-4">
                <span class="bg-green-100 text-green-600 px-2 py-1 rounded-md text-[10px] font-bold">
                    ${student.status || 'เช็คชื่อแล้ว'}
                </span>
            </td>
        `;
        tbody.appendChild(row);
    });
}