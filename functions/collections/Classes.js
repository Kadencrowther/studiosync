// Classes Collection Detailed Map
const CLASSES_MAP = {
  collection: "Classes",
  description: "Class schedules, capacity, and enrollment",
  
  fields: {
    ClassName: "string - Name of the class",
    Days: "array - Days of week class meets (e.g., ['mon', 'wed', 'fri'])",
    StartTime: "string - Start time in 24h format",
    EndTime: "string - End time in 24h format", 
    Duration: "number - Length in minutes",
    MaxSize: "number - Maximum class capacity",
    Students: "array - List of enrolled student IDs",
    InstructorId: "string - Assigned instructor ID",
    RoomId: "string - Assigned studio room ID",
    ClassStyleId: "string - Associated style/genre ID",
    ClassType: "string - Type (e.g., 'Recreational', 'Competitive')",
    SeasonId: "string - Associated season ID",
    MinAge: "number - Minimum student age",
    MaxAge: "number - Maximum student age",
    Fee: "array - Fee structure",
    Description: "string - Class description",
    CreatedAt: "timestamp - Creation timestamp"
  },
  
  commonQueries: [
    "Today's class schedule",
    "Classes that are full", 
    "Available class spots",
    "Classes by instructor",
    "Classes by day/time"
  ],
  
  queryPatterns: {
    todayClasses: {
      type: "list",
      filters: [{"field": "Days", "operator": "array-contains", "value": "CURRENT_DAY"}],
      description: "Get classes scheduled for today"
    },
    fullClasses: {
      type: "list", 
      description: "Classes where Students.length >= MaxSize"
    },
    availableClasses: {
      type: "list",
      description: "Classes where Students.length < MaxSize"
    },
    classByInstructor: {
      type: "list",
      filters: [{"field": "InstructorId", "operator": "==", "value": "INSTRUCTOR_ID"}]
    },
    classesByDay: {
      type: "list", 
      filters: [{"field": "Days", "operator": "array-contains", "value": "DAY"}]
    }
  },
  
  relationships: {
    "Students": "Enrolled students via Students array field",
    "Instructors": "Connected via InstructorId field", 
    "StudioRooms": "Connected via RoomId field",
    "ClassStyles": "Connected via ClassStyleId field",
    "Seasons": "Connected via SeasonId field"
  }
};

module.exports = CLASSES_MAP; 