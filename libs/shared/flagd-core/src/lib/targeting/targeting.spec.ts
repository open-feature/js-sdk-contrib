import {Targeting} from "./targeting";

describe("String comparison operator", () => {
  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  })

  it("should evaluate starts with calls", () => {
    const input = {"starts_with": [{"var": "email"}, "admin"]}
    expect(targeting.applyTargeting(input, {email: "admin@abc.com"})).toBeTruthy()
  });

  it("should evaluate ends with calls", () => {
    const input = {"ends_with": [{"var": "email"}, "abc.com"]}
    expect(targeting.applyTargeting(input, {email: "admin@abc.com"})).toBeTruthy()
  });

  it("should fail with invalid data - missing input", () => {
    const input = {"starts_with": [{"var": "email"}]}
    expect(targeting.applyTargeting(input, {email: "admin@abc.com"})).toBeFalsy()
  });

  it("should fail with invalid data - non string variable", () => {
    const input = {"starts_with": [{"var": "someNumber"}, "abc.com"]}
    expect(targeting.applyTargeting(input, {someNumber: 123456})).toBeFalsy()
  });

  it("should fail with invalid data - non string comparator", () => {
    const input = {"starts_with": [{"var": "email"}, 123456]}
    expect(targeting.applyTargeting(input, {email: "admin@abc.com"})).toBeFalsy()
  });
});


describe("Sem ver operator", () => {
  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  })

  it('should support equal operator', () => {
    const input = {"sem_ver": ['v1.2.3', "=", "1.2.3"]}
    expect(targeting.applyTargeting(input, {})).toBeTruthy()
  });

  it('should support neq operator', () => {
    const input = {"sem_ver": ['v1.2.3', "!=", "1.2.4"]}
    expect(targeting.applyTargeting(input, {})).toBeTruthy()
  });

  it('should support lt operator', () => {
    const input = {"sem_ver": ['v1.2.3', "<", "1.2.4"]}
    expect(targeting.applyTargeting(input, {})).toBeTruthy()
  });

  it('should support lte operator', () => {
    const input = {"sem_ver": ['v1.2.3', "<=", "1.2.3"]}
    expect(targeting.applyTargeting(input, {})).toBeTruthy()
  });

  it('should support gte operator', () => {
    const input = {"sem_ver": ['v1.2.3', ">=", "1.2.3"]}
    expect(targeting.applyTargeting(input, {})).toBeTruthy()
  });

  it('should support gt operator', () => {
    const input = {"sem_ver": ['v1.2.4', ">", "1.2.3"]}
    expect(targeting.applyTargeting(input, {})).toBeTruthy()
  });

  it('should support major comparison operator', () => {
    const input = {"sem_ver": ["v1.2.3", "^", "v1.0.0"]}
    expect(targeting.applyTargeting(input, {})).toBeTruthy()
  });

  it('should support minor comparison operator', () => {
    const input = {"sem_ver": ["v5.0.3", "~", "v5.0.8"]}
    expect(targeting.applyTargeting(input, {})).toBeTruthy()
  });

  it('should handle unknown operator', () => {
    const input = {"sem_ver": ["v1.0.0", "-", "v1.0.0"]}
    expect(targeting.applyTargeting(input, {})).toBeFalsy()
  });

  it('should handle invalid inputs', () => {
    const input = {"sem_ver": ["myVersion_1", "=", "myVersion_1"]}
    expect(targeting.applyTargeting(input, {})).toBeFalsy()
  });

  it('should validate inputs', () => {
    const input = {"sem_ver": ["myVersion_2", "+", "myVersion_1", "myVersion_1"]}
    expect(targeting.applyTargeting(input, {})).toBeFalsy()
  });
})
