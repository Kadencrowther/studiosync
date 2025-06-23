// Instructors Collection Detailed Map
const INSTRUCTORS_MAP = {
  collection: "Instructors",
  description: "Teaching staff information",
  
  fields: {
    FirstName: "string - Instructor's first name",
    LastName: "string - Instructor's last name",
    Email: "string - Instructor's email address",
    Phone: "string - Instructor's phone number",
    Active: "boolean - Whether instructor is currently active",
    CreatedAt: "timestamp - When instructor was added",
    UpdatedAt: "timestamp - Last update timestamp"
  },
  
  commonQueries: [
    "Active instructors",
    "All instructors list",
    "Instructor contact info",
    "Teaching assignments"
  ],
  
  queryPatterns: {
    activeInstructors: {
      type: "list",
      filters: [{"field": "Active", "operator": "==", "value": true}],
      description: "Get all currently active instructors"
    },
    instructorCount: {
      type: "count",
      filters: [{"field": "Active", "operator": "==", "value": true}],
      description: "Count of active instructors"
    },
    allInstructors: {
      type: "list",
      description: "Get all instructor records"
    }
  },
  
  relationships: {
    "Classes": "Instructors teach classes via InstructorId field in Classes collection"
  }
};

module.exports = INSTRUCTORS_MAP; 