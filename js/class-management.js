// Function to add a class
async function addClass(event) {
    event.preventDefault();
    console.log("addClass function called");
    const formData = {
        name: document.getElementById('className').value,
        type: document.getElementById('classType').value,
        style: document.getElementById('classStyle').value,
        day: document.getElementById('classDay').value,
        time: document.getElementById('classTime').value,
        teacher: document.getElementById('teacherName').value,
        songs: document.getElementById('classSongs').value
    };

    try {
        const docRef = await db.collection('classes').add(formData);
        console.log("Class added with ID: ", docRef.id);
        alert('Class added successfully!');
        document.getElementById('addClassForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('addClassModal')).hide();
        
        // Add the new class to the table immediately
        addClassToTable(docRef.id, formData);
    } catch (error) {
        console.error('Error adding class: ', error);
        alert('An error occurred while adding the class.');
    }
}

// Function to add a single class to the table
function addClassToTable(id, classData) {
    const classTableBody = document.getElementById('classTableBody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${classData.name}</td>
        <td>${classData.type}</td>
        <td>${classData.style}</td>
        <td>${classData.day}</td>
        <td>${classData.time}</td>
        <td>${classData.teacher}</td>
        <td>${classData.songs}</td>
        <td>
            <button class="btn btn-sm btn-primary" onclick="editClass('${id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteClass('${id}')">Delete</button>
        </td>
    `;
    classTableBody.appendChild(row);
}

// Function to load classes
async function loadClasses() {
    const classTableBody = document.getElementById('classTableBody');
    classTableBody.innerHTML = '';

    try {
        const snapshot = await db.collection('classes').get();
        snapshot.forEach((doc) => {
            addClassToTable(doc.id, doc.data());
        });
    } catch (error) {
        console.error('Error loading classes: ', error);
    }
}

// Function to edit a class
async function editClass(classId) {
    try {
        const doc = await db.collection('classes').doc(classId).get();
        const classData = doc.data();
        
        document.getElementById('editClassId').value = classId;
        document.getElementById('editClassName').value = classData.name;
        document.getElementById('editClassType').value = classData.type;
        document.getElementById('editClassStyle').value = classData.style;
        document.getElementById('editClassDay').value = classData.day;
        document.getElementById('editClassTime').value = classData.time;
        document.getElementById('editTeacherName').value = classData.teacher;
        document.getElementById('editClassSongs').value = classData.songs;

        new bootstrap.Modal(document.getElementById('editClassModal')).show();
    } catch (error) {
        console.error('Error loading class for edit: ', error);
    }
}

// Function to save edited class
async function saveChanges(event) {
    event.preventDefault();
    const classId = document.getElementById('editClassId').value;
    const updatedData = {
        name: document.getElementById('editClassName').value,
        type: document.getElementById('editClassType').value,
        style: document.getElementById('editClassStyle').value,
        day: document.getElementById('editClassDay').value,
        time: document.getElementById('editClassTime').value,
        teacher: document.getElementById('editTeacherName').value,
        songs: document.getElementById('editClassSongs').value
    };

    try {
        await db.collection('classes').doc(classId).update(updatedData);
        alert('Class updated successfully!');
        bootstrap.Modal.getInstance(document.getElementById('editClassModal')).hide();
        loadClasses(); // Refresh the table
    } catch (error) {
        console.error('Error updating class: ', error);
        alert('An error occurred while updating the class.');
    }
}

// Function to delete a class
async function deleteClass(classId) {
    if (confirm('Are you sure you want to delete this class?')) {
        try {
            await db.collection('classes').doc(classId).delete();
            alert('Class deleted successfully!');
            loadClasses(); // Refresh the table
        } catch (error) {
            console.error('Error deleting class: ', error);
            alert('An error occurred while deleting the class.');
        }
    }
}

// Function to show Add Class Modal
function showAddClassModal() {
    console.log("showAddClassModal function called");
    document.getElementById('addClassForm').reset(); // Reset the form
    new bootstrap.Modal(document.getElementById('addClassModal')).show();
}

// Load classes when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired");
    loadClasses();
    document.getElementById('addClassForm').addEventListener('submit', addClass);
});

// Event listeners
document.getElementById('addClassForm').addEventListener('submit', addClass);
document.getElementById('editClassForm').addEventListener('submit', saveChanges);