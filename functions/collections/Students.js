// Students Collection Detailed Map
const STUDENTS_MAP = {
  collection: "Students",
  description: "All students enrolled in the studio",
  
  fields: {
    FirstName: "string - Student's first name",
    LastName: "string - Student's last name", 
    DateOfBirth: "timestamp - Student's birth date",
    FamilyId: "string - Associated family ID",
    Gender: "string - Student's gender",
    CreatedAt: "timestamp - When student was added",
    Classes: "array - List of enrolled class IDs",
    MedicalConditions: "string - Medical information",
    SkillLevel: "string - Student's skill level",
    Active: "boolean - Whether student is currently active",
    LastUpdated: "timestamp - Last update timestamp"
  },
  
  commonQueries: [
    "How many students do we have?",
    "How many active students?", 
    "New students this week/month",
    "Students by age group",
    "Students in specific classes"
  ],
  
  queryPatterns: {
    activeStudents: {
      type: "count",
      filters: [{"field": "Active", "operator": "==", "value": true}]
    },
    newStudents: {
      type: "count", 
      filters: [{"field": "CreatedAt", "operator": ">=", "value": "DATE_RANGE"}]
    },
    studentsByAge: {
      type: "list",
      description: "Filter by DateOfBirth range for age groups"
    },
    allStudents: {
      type: "list",
      description: "Get all students with basic info"
    }
  },
  
  relationships: {
    "Families": "Connected via FamilyId field",
    "Classes": "Students enrolled in classes via Classes array"
  }
};

module.exports = STUDENTS_MAP; 